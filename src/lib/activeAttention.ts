import {recordMinuteActivity,canScheduleMinuteActivity} from '@/lib/minuteActivity';
import {DEMO_MODE,PREVIEW_DEPLOY} from '@/lib/demoMode';
import {isOptedOut} from '@/lib/clientId';
import type {AttentionPayload,AttentionSegment} from '../../api/_attention';
const GAP=5*60_000,MAX_SPAN=24*60*60_000;
type Tool='dex'|'league'|'favorites';
/** Estimate interaction time only between trusted foreground activities, never through terminal idle. */
class AttentionTracker {
 private tool:Tool;
 constructor(tool:Tool){this.tool=tool;}
 private run:string|undefined;
 private lastActivity=-Infinity;
 private dirty=false;
 private segments:AttentionSegment[]=[];
 private current:AttentionSegment|undefined;
 private subscribers=new Set<()=>void>();
 private notified=-Infinity;
 private allowed(){return !DEMO_MODE&&!PREVIEW_DEPLOY&&!isOptedOut();}
 private foreground(){return document.visibilityState==='visible'&&document.hasFocus();}
 private reset(){this.segments=[];this.current=undefined;this.notified=-Infinity;this.run=undefined;this.dirty=false;this.lastActivity=-Infinity;}
 private stop=()=>{this.current=undefined;this.run=undefined;if(this.dirty){this.dirty=false;if(canScheduleMinuteActivity(this.tool))for(const notify of this.subscribers)notify();}};
 private hidden=()=>{if(document.visibilityState!=='visible')this.stop();};
 private activity=(event:Event)=>{
  if(!this.allowed()){recordMinuteActivity(this.tool,'',Date.now());this.reset();return;}
  if(!event.isTrusted||!this.foreground())return;
  if(event instanceof PointerEvent&&event.type==='pointermove'&&!event.buttons)return;
  const now=Date.now();
  const rollback=now<this.lastActivity;
  // Reset only the derived five-minute intervals; pending minute facts survive.
  if(now<(this.segments.at(-1)?.end??-Infinity))this.reset();
  if(rollback)this.run=undefined;
  this.run??=crypto.randomUUID();recordMinuteActivity(this.tool,this.run,now,rollback);
  this.lastActivity=now;this.dirty=true;
  const last=this.current;
  if(!last||now<last.end||now-last.end>=GAP){
   this.current={id:crypto.randomUUID(),start:now,end:now};this.segments.push(this.current);
  } else if(now-last.start>MAX_SPAN){
   this.current={id:crypto.randomUUID(),start:last.end,end:now};this.segments.push(this.current);
  } else last.end=now;
  this.segments=this.segments.slice(-50);
  // This only schedules the existing bounded debounce; there is no heartbeat write.
  if(now-this.notified>=60_000&&canScheduleMinuteActivity(this.tool)){this.notified=now;this.dirty=false;for(const notify of this.subscribers)notify();}
 };
 private events=['pointerdown','pointermove','keydown','wheel','touchstart','touchmove','input','change'];
 subscribe(notify:()=>void){
  if(!this.subscribers.size){
   for(const event of this.events)window.addEventListener(event,this.activity,{capture:true,passive:true});
   document.addEventListener('visibilitychange',this.hidden);window.addEventListener('blur',this.stop);window.addEventListener('pagehide',this.stop);
  }
  this.subscribers.add(notify);
  return ()=>{
   if(this.subscribers.size===1)this.stop();
   this.subscribers.delete(notify);
   if(!this.subscribers.size){
    for(const event of this.events)window.removeEventListener(event,this.activity,true);
    document.removeEventListener('visibilitychange',this.hidden);window.removeEventListener('blur',this.stop);window.removeEventListener('pagehide',this.stop);this.stop();
   }
  };
 }
 snapshot():AttentionPayload|undefined {
  if(!this.allowed()){this.reset();return undefined;}
  return this.segments.length?{v:1,segments:this.segments.map(s=>({...s}))}:undefined;
 }
}
const trackers:Record<Tool,AttentionTracker>={dex:new AttentionTracker('dex'),league:new AttentionTracker('league'),favorites:new AttentionTracker('favorites')};
export const attentionPayload=(tool:Tool)=>trackers[tool].snapshot();
export const subscribeAttention=(tool:Tool,notify:()=>void)=>trackers[tool].subscribe(notify);
