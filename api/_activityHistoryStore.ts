import {parseMinuteActivity,MINUTE_ACTIVITY_RETENTION_DAYS,type MinuteActivityTool,type MinuteActivityAck,type StoredMinuteActivityBatch} from './_minuteActivity.js';
const PREFIX='activity:v1',DAY=86_400_000;
export interface ActivityHistoryDB {
  eval(script:string,keys:string[],args:(string|number)[]):Promise<unknown>;
  hgetall(key:string):Promise<Record<string,unknown>|null>;
  hscan(key:string,cursor:number,options:{count:number}):Promise<[number,unknown[]]>;
}
export interface ActivityHistoryOptions {db?:ActivityHistoryDB;env?:Record<string,string|undefined>;cid?:string;tool?:MinuteActivityTool;cursor?:string}
async function database(options:ActivityHistoryOptions):Promise<ActivityHistoryDB> {
  return options.db ?? (await import('./_shared.js')).redis as unknown as ActivityHistoryDB;
}
function settings(now:number,options:ActivityHistoryOptions) {
 const env=options.env??process.env,d=new Date(now),month=d.toISOString().slice(0,7);
 const positive=(raw:string|undefined,fallback:number)=>raw&&/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))&&Number(raw)>0?Number(raw):fallback;
 return {enabled:env.MINUTE_ACTIVITY_ENABLED!=='0',month,key:`${PREFIX}:budget:${month}`,limitUnits:Math.min(2_000_000,positive(env.MINUTE_ACTIVITY_MONTHLY_UNITS,2_000_000)),limitBytes:Math.min(16*1024*1024,positive(env.MINUTE_ACTIVITY_MONTHLY_BYTES,16*1024*1024)),retryAt:Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)};
}
/** Reserve ordinary progress/history work conservatively, including the outer EVAL and core ingestion margin.
 * Independent core work (large new-species imports, milestones, exports) is outside this feature estimate.
 * Retries consume units and byte allowance too.
 * A request refused at exhaustion still costs its EVAL/read; normal clients must honor retryAt.
 */
export const ACTIVITY_APPEND_SCRIPT=`
local used=tonumber(redis.call('HGET',KEYS[1],'units') or '0')
local bytes=tonumber(redis.call('HGET',KEYS[1],'bytes') or '0')
local reserve=tonumber(ARGV[3])
local incoming=tonumber(ARGV[4])
if redis.call('HGET',KEYS[1],'paused')=='1' then return {'paused'} end
if used+reserve>tonumber(ARGV[1]) or bytes+incoming>tonumber(ARGV[2]) then
 redis.call('HSET',KEYS[1],'paused','1')
 redis.call('EXPIREAT',KEYS[1],ARGV[5])
 return {'paused'}
end
redis.call('HINCRBY',KEYS[1],'units',reserve)
redis.call('HINCRBY',KEYS[1],'bytes',incoming)
redis.call('EXPIREAT',KEYS[1],ARGV[5])
local result={'recorded'}
for i=2,#KEYS do
 local offset=6+(i-2)*5
 local known=redis.call('HGET',KEYS[i],ARGV[offset])
 if not known then
  redis.call('HSET',KEYS[i],ARGV[offset],ARGV[offset+1])
  redis.call('EXPIREAT',KEYS[i],ARGV[offset+2])
  redis.call('HINCRBY',KEYS[1],'buckets',ARGV[offset+3])
  table.insert(result,ARGV[offset+4])
 elseif known==ARGV[offset+1] then table.insert(result,ARGV[offset+4])
 else result[1]='invalid' end
end
return result`;
export async function appendMinuteActivity(cid:string,tool:MinuteActivityTool,raw:unknown,receivedAt:number,options:ActivityHistoryOptions={}):Promise<MinuteActivityAck|undefined> {
 if(raw===undefined)return undefined;
 const config=settings(receivedAt,options);
 if(!config.enabled)return {accepted:[],status:'disabled',retryAt:config.retryAt};
 const payload=parseMinuteActivity(raw,receivedAt);
 if(!payload||!/^[-\w]{8,80}$/.test(cid))return {accepted:[],status:'invalid'};
 if(!payload.batches.length)return {accepted:[],status:'recorded'};
 const keys=[config.key],args:(string|number)[]=[config.limitUnits,config.limitBytes,64+8*payload.batches.length,0,Math.floor((config.retryAt+32*DAY)/1000)];
 let bytes=0;
 for(const batch of payload.batches){
  // receivedAt is omitted from immutable facts: delivery retries have different reception timestamps.
  const stored=JSON.stringify({...batch,cid,tool});
  bytes+=Buffer.byteLength(stored);
  keys.push(`${PREFIX}:day:${batch.day}`);
  args.push(`${cid}:${tool}:${batch.id}`,stored,Math.floor((Date.parse(batch.day)+MINUTE_ACTIVITY_RETENTION_DAYS*DAY)/1000),batch.buckets.length,batch.id);
 }
 args[3]=bytes;
 try {
  const response=await (await database(options)).eval(ACTIVITY_APPEND_SCRIPT,keys,args);
  if(!Array.isArray(response)||!['recorded','invalid','paused'].includes(String(response[0])))throw Error('Invalid detail-store response');
  const status=response[0] as 'recorded'|'invalid'|'paused';
  return {status,accepted:response.slice(1).filter((s):s is string=>typeof s==='string'),...(status==='paused'?{retryAt:config.retryAt}:{})};
 }catch{return {accepted:[],status:'paused',retryAt:receivedAt+60_000};}
}
export async function readMinuteActivityBudget(now:number,options:ActivityHistoryOptions={}) {
 const config=settings(now,options);
 const raw=await (await database(options)).hgetall(config.key);
 const num=(key:string)=>Math.max(0,Number(raw?.[key])||0);
 const usedUnits=num('units'),bytes=num('bytes'),paused=String(raw?.paused)==='1'||usedUnits+72>config.limitUnits||bytes>=config.limitBytes;
 return {month:config.month,status:!config.enabled?'disabled':paused?'paused':'collecting',usedUnits,limitUnits:config.limitUnits,bytes,limitBytes:config.limitBytes,acceptedBuckets:num('buckets'),...(paused||!config.enabled?{pausedUntil:config.retryAt}:{})};
}
/** Explicit history reads only. Return complete HSCAN pages; never resume at mutable page offsets. */
export async function loadMinuteActivityHistory(from:number,to:number,options:ActivityHistoryOptions={}) {
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<from||to-from>31*DAY)throw new RangeError('History range must be at most 31 days');
 const db=await database(options),batches:StoredMinuteActivityBatch[]=[];
 let bucketCount=0,truncated=false,cursorDay:string|undefined,nextCursor:string|undefined,scanned=0,blockedPage=false;
 let resume:{day:string;cursor:number}|undefined;
 if(options.cursor){
  if(options.cursor.length>256)throw new RangeError('Invalid history cursor');
  try {
   resume=JSON.parse(Buffer.from(options.cursor,'base64url').toString());
   if(!resume||!/^\d{4}-\d{2}-\d{2}$/.test(resume.day)||!Number.isFinite(Date.parse(resume.day))||new Date(Date.parse(resume.day)).toISOString().slice(0,10)!==resume.day||!Number.isSafeInteger(resume.cursor)||resume.cursor<0||Date.parse(resume.day)<Math.floor(from/DAY)*DAY||Date.parse(resume.day)>to)throw Error();
  }catch{throw new RangeError('Invalid history cursor');}
 }
 const days=Math.floor(to/DAY)-Math.floor(from/DAY)+1;
 if(days>31)throw new RangeError('History range must cover at most 31 UTC days');
 for(let n=0;n<days&&!truncated;n++){
  const day=new Date((Math.floor(from/DAY)+n)*DAY).toISOString().slice(0,10);
  if(resume&&day<resume.day)continue;
  let cursor=resume?.day===day?resume.cursor:0;
  const stop=(inputCursor:number,blocked=false)=>{truncated=true;cursorDay=day;blockedPage=blocked;if(!blocked)nextCursor=Buffer.from(JSON.stringify({day,cursor:inputCursor})).toString('base64url');};
  do {
   const inputCursor=cursor,page=await db.hscan(`${PREFIX}:day:${day}`,cursor,{count:100});cursor=Number(page[0]);
   const entries=page[1].length/2;
   if(entries>2000){stop(inputCursor,true);break;}
   if(scanned+entries>2000){stop(inputCursor);break;}
   const pageBatches:StoredMinuteActivityBatch[]=[];
   let pageBuckets=0;
   for(let i=1;i<page[1].length;i+=2){
    let raw:unknown=page[1][i];try{if(typeof raw==='string')raw=JSON.parse(raw);}catch{continue;}
    if(!raw||typeof raw!=='object')continue;
    const b=raw as StoredMinuteActivityBatch;
    if(typeof b.cid!=='string'||!/^[-\w]{8,80}$/.test(b.cid)||!['dex','league','favorites'].includes(b.tool)||options.cid&&options.cid!==b.cid||options.tool&&options.tool!==b.tool)continue;
    const parsed=parseMinuteActivity({v:1,batches:[b]},Date.parse(day)+DAY);
    if(!parsed)continue;
    const buckets=parsed.batches[0].buckets.filter(s=>s.last>=from&&s.first<=to).map(s=>({...s,first:Math.max(s.first,from),last:Math.min(s.last,to)}));
    pageBuckets+=buckets.length;
    if(pageBuckets>10000){stop(inputCursor,true);break;}
    if(buckets.length)pageBatches.push({...parsed.batches[0],buckets,cid:b.cid,tool:b.tool});
   }
   if(truncated)break;
   if(bucketCount+pageBuckets>10000){stop(inputCursor);break;}
   scanned+=entries;bucketCount+=pageBuckets;batches.push(...pageBatches);
  }while(cursor&&!truncated);
 }
 return {batches,coverage:{from,to,retentionDays:MINUTE_ACTIVITY_RETENTION_DAYS,incomplete:batches.some(b=>b.incomplete),bucketCount,weakConsistency:true},truncated,...(cursorDay?{cursorDay,...(nextCursor?{nextCursor}:{}),...(blockedPage?{blockedPage:true}:{})}:{})};
}
