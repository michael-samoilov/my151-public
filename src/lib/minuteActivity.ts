import {DEMO_MODE,PREVIEW_DEPLOY} from '@/lib/demoMode';
import {isOptedOut} from '@/lib/clientId';
import type {MinuteActivityAck,MinuteActivityBatch,MinuteActivityBucket,MinuteActivityPayload,MinuteActivityTool} from '../../api/_minuteActivity';

const KEY='p151-minute-history-v1',MAX_BYTES=48_000,MAX_PAYLOAD_BYTES=12_000,MAX_BUCKETS=40;
type State={pending:MinuteActivityBatch[];open:MinuteActivityBucket[];incomplete?:true;pauseUntil:number};
const states:Record<MinuteActivityTool,State>={dex:{pending:[],open:[],pauseUntil:0},league:{pending:[],open:[],pauseUntil:0},favorites:{pending:[],open:[],pauseUntil:0}};
let loaded=false;
let persistTimer:ReturnType<typeof setTimeout>|undefined;
const tab=crypto.randomUUID();
const allowed=()=>!DEMO_MODE&&!PREVIEW_DEPLOY&&!isOptedOut();
function clear(){if(persistTimer)clearTimeout(persistTimer);persistTimer=undefined;for(const state of Object.values(states)){state.pending=[];state.open=[];state.pauseUntil=0;delete state.incomplete;}try{sessionStorage.removeItem(KEY);}catch{return;}}
function load(){
 if(loaded)return;loaded=true;
 if(!allowed()){clear();return;}
 try{
  const raw=sessionStorage.getItem(KEY);
  if(raw&&raw.length<=MAX_BYTES){
   const parsed=JSON.parse(raw) as {tab:string;states:Partial<Record<MinuteActivityTool,State>>};
   const saved=parsed.states;
   for(const tool of Object.keys(states) as MinuteActivityTool[]){
    const value=saved[tool];
    if(value&&Array.isArray(value.pending)&&value.pending.every(b=>typeof b.id==='string'&&typeof b.tab==='string'&&typeof b.day==='string'&&Array.isArray(b.buckets)&&b.buckets.length<=MAX_BUCKETS&&b.buckets.every(x=>typeof x.run==='string'&&Number.isFinite(x.first)&&Number.isFinite(x.last)&&x.last>=x.first))){
     states[tool].pending=value.pending;states[tool].pauseUntil=Number.isFinite(value.pauseUntil)?value.pauseUntil:0;
     if(value.incomplete)states[tool].incomplete=true;
     if(Array.isArray(value.open)&&value.open.length<=MAX_BUCKETS){
      states[tool].open=value.open;if(value.open.length)states[tool].incomplete=true;seal(states[tool],parsed.tab);
     }
    }
   }
  }
 }catch{return;}
}
function persist(){
 load();
 if(!allowed()){clear();return;}
 if(persistTimer)clearTimeout(persistTimer);persistTimer=undefined;
 try{
  let raw=JSON.stringify({tab,states});
  while(raw.length>MAX_BYTES){
   const state=Object.values(states).find(s=>s.pending.length);
   if(!state)break;
   state.pending.shift();state.incomplete=true;raw=JSON.stringify({tab,states});
  }
  sessionStorage.setItem(KEY,raw);
 }catch{for(const state of Object.values(states))state.incomplete=true;}
}
function seal(state:State,batchTab:string=tab){
 while(state.open.length){
  const day=new Date(state.open[0].first).toISOString().slice(0,10);
  const buckets:MinuteActivityBucket[]=[];
  while(state.open.length&&buckets.length<MAX_BUCKETS&&new Date(state.open[0].first).toISOString().slice(0,10)===day)buckets.push(state.open.shift()!);
  state.pending.push({id:crypto.randomUUID(),tab:batchTab,day,buckets,...(state.incomplete?{incomplete:true as const}:{})});delete state.incomplete;
 }
}
export function recordMinuteActivity(tool:MinuteActivityTool,run:string,now:number,clockRollback=false){
 load();if(!allowed()){clear();return;}
 const state=states[tool];if(now<state.pauseUntil)return;
 if(clockRollback)state.incomplete=true;
 const last=state.open.at(-1);
 if(last&&last.run===run&&Math.floor(last.first/60_000)===Math.floor(now/60_000)&&now>=last.last)last.last=now;
 else state.open.push({run,first:now,last:now});
 if(state.open.length>=MAX_BUCKETS)seal(state);
 if(!persistTimer)persistTimer=setTimeout(persist,1000);
}
export function minuteActivityPayload(tool:MinuteActivityTool):MinuteActivityPayload|undefined{
 load();if(!allowed()){clear();return undefined;}
 const state=states[tool];if(Date.now()<state.pauseUntil)return undefined;
 seal(state);persist();
 const batches:MinuteActivityBatch[]=[];
 for(const batch of state.pending){
  if(batches.length===4||JSON.stringify({v:1,batches:[...batches,batch]}).length>MAX_PAYLOAD_BYTES)break;
  batches.push(batch);
 }
 return batches.length?{v:1,batches}:undefined;
}
export function acknowledgeMinuteActivity(tool:MinuteActivityTool,value:unknown){
 load();if(!allowed()){clear();return;}
 if(!value||typeof value!=='object')return;
 const ack=value as MinuteActivityAck,state=states[tool];
 if(!Array.isArray(ack.accepted)||!['recorded','paused','disabled','invalid'].includes(ack.status))return;
 state.pending=state.pending.filter(b=>!ack.accepted.includes(b.id));
 if(ack.status==='paused'){state.pauseUntil=Number.isFinite(ack.retryAt)?Math.max(Date.now(),ack.retryAt!):Date.now()+60*60_000;state.incomplete=true;}
 if(ack.status==='disabled'){state.pauseUntil=Date.now()+60*60_000;state.incomplete=true;}
 persist();
}
if(typeof window!=='undefined'){
 window.addEventListener('storage',()=>{if(!allowed())clear();});
 window.addEventListener('p151-opt-out',()=>{if(!allowed())clear();});
 window.addEventListener('blur',persist);window.addEventListener('pagehide',persist);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist();});
}

/** Keep optional history below the browser's shared keepalive body limit. */
export function encodeActivityBeacon(payload:Record<string,unknown>):string{
 const activity=payload.activity as MinuteActivityPayload|undefined;
 if(!activity)return JSON.stringify(payload);
 const batches=[...activity.batches];
 let body=JSON.stringify({...payload,activity:{v:1,batches}});
 while(new TextEncoder().encode(body).byteLength>60_000&&batches.length){
  batches.pop();
  body=JSON.stringify({...payload,activity:batches.length?{v:1,batches}:undefined});
 }
 return body;
}

export function canScheduleMinuteActivity(tool:MinuteActivityTool):boolean{
 load();if(!allowed()){clear();return false;}
 return Date.now()>=states[tool].pauseUntil;
}
