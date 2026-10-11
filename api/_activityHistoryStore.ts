import {parseMinuteActivity,MINUTE_ACTIVITY_RETENTION_DAYS,type MinuteActivityTool,type MinuteActivityAck,type StoredMinuteActivityBatch} from './_minuteActivity.js';
const PREFIX='activity:v1',DAY=86_400_000;
export interface ActivityHistoryDB {
  eval(script:string,keys:string[],args:(string|number)[]):Promise<unknown>;
  hgetall(key:string):Promise<Record<string,unknown>|null>;
  hscan(key:string,cursor:number,options:{count:number}):Promise<[number,unknown[]]>;
}
export interface ActivityHistoryOptions {db?:ActivityHistoryDB;env?:Record<string,string|undefined>;cid?:string;tool?:MinuteActivityTool}
async function database(options:ActivityHistoryOptions):Promise<ActivityHistoryDB> {
  return options.db ?? (await import('./_shared.js')).redis as unknown as ActivityHistoryDB;
}
function settings(now:number,options:ActivityHistoryOptions) {
 const env=options.env??process.env,d=new Date(now),month=d.toISOString().slice(0,7);
 const positive=(raw:string|undefined,fallback:number)=>raw&&/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))&&Number(raw)>0?Number(raw):fallback;
 return {enabled:env.MINUTE_ACTIVITY_ENABLED!=='0',month,key:`${PREFIX}:budget:${month}`,limitUnits:positive(env.MINUTE_ACTIVITY_MONTHLY_UNITS,2_000_000),limitBytes:positive(env.MINUTE_ACTIVITY_MONTHLY_BYTES,16*1024*1024),retryAt:Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)};
}
/** Reserve the complete request conservatively, including the outer EVAL and core ingestion allowance.
 * Every branch has fewer internal calls than its reservation. Retries consume units and byte allowance too.
 * A request refused at exhaustion still costs its EVAL/read; normal clients must honor retryAt.
 */
export const ACTIVITY_APPEND_SCRIPT=`
local used=tonumber(redis.call('HGET',KEYS[1],'units') or '0')
local bytes=tonumber(redis.call('HGET',KEYS[1],'bytes') or '0')
local reserve=tonumber(ARGV[3])
local incoming=tonumber(ARGV[4])
if used+reserve>tonumber(ARGV[1]) or bytes+incoming>tonumber(ARGV[2]) then return {'paused'} end
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
 const keys=[config.key],args:(string|number)[]=[config.limitUnits,config.limitBytes,32+8*payload.batches.length,0,Math.floor((config.retryAt+32*DAY)/1000)];
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
 const usedUnits=num('units'),bytes=num('bytes'),paused=usedUnits+40>config.limitUnits||bytes>=config.limitBytes;
 return {month:config.month,status:!config.enabled?'disabled':paused?'paused':'collecting',usedUnits,limitUnits:config.limitUnits,bytes,limitBytes:config.limitBytes,acceptedBuckets:num('buckets'),...(paused||!config.enabled?{pausedUntil:config.retryAt}:{})};
}
/** Explicit history reads only. Maximum 31 days and 10,000 returned buckets; ordinary dashboards never call this. */
export async function loadMinuteActivityHistory(from:number,to:number,options:ActivityHistoryOptions={}) {
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<from||to-from>31*DAY)throw new RangeError('History range must be at most 31 days');
 const db=await database(options),batches:StoredMinuteActivityBatch[]=[];
 let bucketCount=0,truncated=false,cursorDay:string|undefined;
 const days=Math.floor(to/DAY)-Math.floor(from/DAY)+1;
 if(days>31)throw new RangeError('History range must cover at most 31 UTC days');
 for(let n=0;n<days&&!truncated;n++){
  const day=new Date((Math.floor(from/DAY)+n)*DAY).toISOString().slice(0,10);
  let cursor=0,scanned=0;
  do {
   const page=await db.hscan(`${PREFIX}:day:${day}`,cursor,{count:100});cursor=Number(page[0]);
   for(let i=1;i<page[1].length;i+=2){
    if(++scanned>2000){truncated=true;cursorDay=day;break;}
    let raw:unknown=page[1][i];try{if(typeof raw==='string')raw=JSON.parse(raw);}catch{continue;}
    if(!raw||typeof raw!=='object')continue;
    const b=raw as StoredMinuteActivityBatch;
    if(typeof b.cid!=='string'||!/^[-\w]{8,80}$/.test(b.cid)||!['dex','league','favorites'].includes(b.tool)||options.cid&&options.cid!==b.cid||options.tool&&options.tool!==b.tool)continue;
    const parsed=parseMinuteActivity({v:1,batches:[b]},Date.parse(day)+DAY);
    if(!parsed)continue;
    const buckets=parsed.batches[0].buckets.filter(s=>s.last>=from&&s.first<=to).map(s=>({...s,first:Math.max(s.first,from),last:Math.min(s.last,to)}));
    if(bucketCount+buckets.length>10000){truncated=true;cursorDay=day;break;}
    if(buckets.length){bucketCount+=buckets.length;batches.push({...parsed.batches[0],buckets,cid:b.cid,tool:b.tool,receivedAt:Date.parse(day)+DAY});}
   }
  }while(cursor&&!truncated);
 }
 return {batches,coverage:{from,to,retentionDays:MINUTE_ACTIVITY_RETENTION_DAYS,incomplete:batches.some(b=>b.incomplete),bucketCount},truncated,...(cursorDay?{cursorDay}:{})};
}
