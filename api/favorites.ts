import {parseAttentionForIngest} from './_attention.js';
import {appendMinuteActivity} from './_activityHistoryStore.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { SUBMIT_CLIENT_DAILY_CAP } from './_limits.js';
import { JOURNAL_MAX_PER_DAY, JOURNAL_TTL_S, parsePage } from './_events.js';
import { redis, getClientIp, getClient, getGeo, getLang, isReadOnlyDeployment, parseLocale, parseReferrerHost, MAX_CLIENTS } from './_shared.js';
import { parseCapturedAt } from './_sessionize.js';
import { parseNotmeFlag } from './_exportStats.js';
import { FAVORITE_CLIENTS_KEY, FAVORITE_VERSION_KEY, favoriteSessionAt, parseFavoriteSnapshot, parseFavoriteRecord, mergeFavoriteRecord, type FavoriteBeaconKind, type FavoriteExportKind } from './_favoriteRecord.js';
const burstLimiter = new Ratelimit({redis,limiter:Ratelimit.fixedWindow(500,'10 m'),analytics:false,prefix:'rl:burst'});
const clientLimiter = new Ratelimit({redis,limiter:Ratelimit.fixedWindow(SUBMIT_CLIENT_DAILY_CAP,'1 d'),analytics:false,prefix:'rl:client'});
const CAS = `
if redis.call('EXISTS', KEYS[3]) == 1 then return 2 end
local cur = redis.call('HGET', KEYS[2], ARGV[1]) or '0'
if cur ~= ARGV[2] then return 0 end
if cur == '0' and redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[4]) then return 3 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('HSET', KEYS[2], ARGV[1], tostring(tonumber(cur) + 1))
redis.call('SET', KEYS[3], '1', 'EX', ARGV[8])
local events = cjson.decode(ARGV[5])
for _, event in ipairs(events) do
 redis.call('HINCRBY', KEYS[4], event.ev, 1)
 redis.call('HINCRBY', KEYS[5], event.ev, 1)
 redis.call('RPUSH', KEYS[6], cjson.encode(event))
end
if #events > 0 then
 redis.call('EXPIRE', KEYS[5], 10368000)
 redis.call('EXPIRE', KEYS[6], ARGV[6])
 redis.call('LTRIM', KEYS[6], -tonumber(ARGV[7]), -1)
end
return 1
`;
export default async function handler(req:VercelRequest,res:VercelResponse) {
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try {
    const b=(req.body??{}) as Record<string,unknown>;
    if(typeof b.cid!=='string'||b.cid.length<8||b.cid.length>64)return res.status(400).json({error:'invalid cid'});
    if(typeof b.id!=='string'||! /^[\w-]{8,80}$/.test(b.id))return res.status(400).json({error:'invalid id'});
    if(!['progress','completion','export','export-shown','nudge-shown'].includes(String(b.kind)))return res.status(400).json({error:'invalid kind'});
    const snapshot=parseFavoriteSnapshot(b.snapshot);
    if(!snapshot)return res.status(400).json({error:'invalid snapshot'});
    if(b.kind==='completion'&&snapshot.filled!==257)return res.status(400).json({error:'invalid completion'});
    const exportKind=b.kind==='export'&&(b.exportKind==='full'||b.exportKind==='simplified')?b.exportKind:undefined;
    if(b.kind==='export'&&!exportKind)return res.status(400).json({error:'invalid export kind'});
    const stats=exportKind!==undefined&&b.stats===true;
    if(parseNotmeFlag(b.notme)||isReadOnlyDeployment(req))return res.status(200).json({ok:true});
    const received=Date.now();const now=parseCapturedAt(b.ts,received);
    if(now===null)return res.status(400).json({error:'invalid captured time'});
    const attention=parseAttentionForIngest(b.attention,received);
    if(attention===null)return res.status(400).json({error:'invalid attention'});
    const drop=async(reason:string)=>{await redis.hincrby('funnel',`favorites-drop:${reason}`,1);};
    for(const [limiter,key,reason] of [[burstLimiter,getClientIp(req),'rate-limit-ip'],[clientLimiter,`favorites:${b.cid}`,'rate-limit-client']] as const){
      const limit=await limiter.limit(key);
      if(!limit.success){await drop(reason);res.setHeader('Retry-After',Math.max(1,Math.ceil((limit.reset-Date.now())/1000)));return res.status(429).json({error:'Too many requests'});}
    }
    const geo=getGeo(req);const ua=getClient(req);const day=new Date(now).toISOString().slice(0,10);
    for(let attempt=0;attempt<6;attempt++){
      const [raw,version]=await Promise.all([redis.hget(FAVORITE_CLIENTS_KEY,b.cid),redis.hget(FAVORITE_VERSION_KEY,b.cid)]);
      const existing=parseFavoriteRecord(raw);
      const session=existing?favoriteSessionAt(existing.sessionLog,now):undefined;
      const events:string[]=session?[]:['favorites-open'];
      for(const [threshold,event] of [[1,'favorites-first-pick'],[65,'favorites-quarter'],[129,'favorites-half'],[257,'favorites-complete']] as const){
        if(snapshot.filled>=threshold&&(existing?.maxFilled??0)<threshold)events.push(event);
      }
      if(b.kind==='nudge-shown'&&!session?.events.includes('favorites-nudge-complete-shown'))events.push('favorites-nudge-complete-shown');
      if(b.kind==='export-shown'&&!session?.events.includes('favorites-export-shown'))events.push('favorites-export-shown');
      if(exportKind)events.push(`favorites-export-${exportKind}`);
      if(stats)events.push('favorites-export-stats');
      const rec=mergeFavoriteRecord(existing,{cid:b.cid,id:b.id,now,receivedAt:received,attention,kind:b.kind as FavoriteBeaconKind,snapshot,exportKind:exportKind as FavoriteExportKind|undefined,events,
        ...geo,...ua,lang:getLang(req),locale:parseLocale(b.locale),switched:parseLocale(b.switched),referrer:parseReferrerHost(b.ref)});
      const entries=events.map(ev=>({t:now,cid:b.cid,tool:'favorites',ev,...(parsePage(b.page)?{page:parsePage(b.page)}:{})}));
      const result=await redis.eval(CAS,[FAVORITE_CLIENTS_KEY,FAVORITE_VERSION_KEY,`favorites:request:${b.cid}:${b.id}`,'funnel',`funnel:${day}`,`journal:${day}`],
        [b.cid,version==null?'0':String(version),JSON.stringify(rec),MAX_CLIENTS,JSON.stringify(entries),JOURNAL_TTL_S,JOURNAL_MAX_PER_DAY,exportKind?JOURNAL_TTL_S:604800]);
      if(result===1||result===2){
        const activityAck=await appendMinuteActivity(b.cid,'favorites',b.activity,received);
        return res.status(200).json({ok:true,activityAck});
      }
      if(result===3){await drop('cap');return res.status(200).json({ok:true,capped:true});}
      await new Promise(r=>setTimeout(r,15+attempt*20));
    }
    await drop('contention');return res.status(200).json({ok:true,contended:true});
  }catch(error){console.error('Favorites error:',error);return res.status(500).json({error:'Internal server error'});}
}
