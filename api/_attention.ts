/** Versioned foreground interaction intervals; legacy session spans are never inferred here. */
export interface AttentionSegment {id:string;start:number;end:number}
export interface AttentionPayload {v:1;segments:AttentionSegment[]}
export interface AttentionRecording extends AttentionPayload {coverageFrom:number;checkpointFrom:number;totalMs:number;asOf:number;retiredThrough?:number}
export const ATTENTION_GAP_MS=5*60_000;
const LIMIT=50, MAX_SPAN=24*60*60_000, PRODUCT_START=Date.UTC(2024,0,1);
const stamp=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=PRODUCT_START;
export function parseAttentionPayload(raw:unknown,receivedAt:number):AttentionPayload|null {
 if(!raw||typeof raw!=='object')return null;
 const r=raw as Record<string,unknown>;
 if(r.v!==1||!Array.isArray(r.segments)||r.segments.length>LIMIT)return null;
 const ids=new Set<string>(),segments:AttentionSegment[]=[];
 for(const value of r.segments){
  if(!value||typeof value!=='object')return null;
  const s=value as Record<string,unknown>;
  if(typeof s.id!=='string'||!/^[-\w]{8,80}$/.test(s.id)||ids.has(s.id)||!stamp(s.start)||!stamp(s.end)||s.end<s.start||s.end-s.start>MAX_SPAN||s.end>receivedAt+ATTENTION_GAP_MS)return null;
  ids.add(s.id);segments.push({id:s.id,start:s.start,end:s.end});
 }
 return {v:1,segments};
}
/** Optional analytics metadata must not reject valid legacy progress when a client clock is ahead. */
export function parseAttentionForIngest(raw:unknown,receivedAt:number):AttentionPayload|null|undefined {
 if(raw===undefined)return undefined;
 const payload=parseAttentionPayload(raw,Infinity);
 if(!payload)return null;
 return payload.segments.some(s=>s.end>receivedAt+ATTENTION_GAP_MS)?undefined:payload;
}
export function parseAttentionRecording(raw:unknown):AttentionRecording|undefined {
 if(!raw||typeof raw!=='object')return undefined;
 const r=raw as Record<string,unknown>;
 if(!stamp(r.asOf)||!stamp(r.coverageFrom)||!stamp(r.checkpointFrom)||r.checkpointFrom<r.coverageFrom||r.asOf<r.checkpointFrom||typeof r.totalMs!=='number'||!Number.isSafeInteger(r.totalMs)||r.totalMs<0||r.retiredThrough!==undefined&&(!stamp(r.retiredThrough)||r.retiredThrough>r.asOf))return undefined;
 const payload=parseAttentionPayload(raw,r.asOf);
 if(!payload)return undefined;
 return {...payload,coverageFrom:r.coverageFrom,checkpointFrom:r.checkpointFrom,totalMs:r.totalMs,asOf:r.asOf,...(r.retiredThrough===undefined?{}:{retiredThrough:r.retiredThrough})};
}
function unionMs(segments:readonly AttentionSegment[],from:number,until:number):number {
 let end=-Infinity,total=0;
 for(const s of [...segments].sort((a,b)=>a.start-b.start||a.end-b.end)){
  total+=Math.max(0,Math.min(s.end,until)-Math.max(s.start,end,from));end=Math.max(end,s.end);
 }
 return total;
}
/** Merge before trimming. Stable IDs make retries and shorter late snapshots idempotent. */
export function mergeAttention(previous:AttentionRecording|undefined,payload:AttentionPayload|undefined,receivedAt:number):AttentionRecording|undefined {
 if(!payload||!payload.segments.length)return previous;
 const old=previous?.segments??[],byId=new Map(old.map(s=>[s.id,{...s}]));
 for(const s of payload.segments){
  if(s.end<=(previous?.retiredThrough??-Infinity))continue;
  const known=byId.get(s.id);
  if(known){if(known.start===s.start)known.end=Math.max(known.end,s.end);}
  else byId.set(s.id,{...s});
 }
 const all=[...byId.values()].sort((a,b)=>a.end-b.end||a.start-b.start||a.id.localeCompare(b.id));
 if(!all.length)return previous;
 const asOf=Math.max(previous?.asOf??receivedAt,receivedAt),coverageFrom=previous?.coverageFrom??Math.min(receivedAt,...all.map(s=>s.start));
 const from=Math.max(coverageFrom,previous?.retiredThrough??-Infinity);
 const delta=unionMs(all,from,asOf)-unionMs(old,from,previous?.asOf??receivedAt);
 const removed=all.slice(0,Math.max(0,all.length-LIMIT));
 const watermark=Math.max(previous?.retiredThrough??-Infinity,...removed.map(s=>Math.min(s.end,asOf)));
 return {v:1,coverageFrom,checkpointFrom:previous?.checkpointFrom??receivedAt,totalMs:(previous?.totalMs??0)+Math.max(0,delta),asOf,segments:all.slice(-LIMIT),...(watermark===-Infinity?{}:{retiredThrough:watermark})};
}
export function attentionSessionCount(segments:readonly Pick<AttentionSegment,'start'|'end'>[]):number {
 let count=0,end=-Infinity;
 for(const s of [...segments].sort((a,b)=>a.start-b.start||a.end-b.end)){
  if(s.start-end>=ATTENTION_GAP_MS)count++;
  end=Math.max(end,s.end);
 }
 return count;
}
