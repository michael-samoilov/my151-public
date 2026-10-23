import {recordMinuteActivity,canScheduleMinuteActivity} from '@/lib/minuteActivity';
import {DEMO_MODE,PREVIEW_DEPLOY} from '@/lib/demoMode';
import {isOptedOut} from '@/lib/clientId';
import type {AttentionPayload,AttentionSegment} from '../../api/_attention';
const GAP=5*60_000,MAX_SPAN=24*60*60_000,DAY=86_400_000;
// Google Analytics' engaged-session threshold, in milliseconds on screen.
const ENGAGED_ON_SCREEN_MS=10_000;
// Google Analytics ends a session after 30 minutes without input. On-screen
// time stops there too, so a tab left on screen overnight adds no new day.
const IDLE_MS=30*60_000;
const dayOf=(ms:number)=>Math.floor(ms/DAY)*DAY;
type Tool='dex'|'league'|'favorites';
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
 private onScreen=new Map<number,number>();
 private seen=new Set<number>();
 // The timed span's start. `mono` is monotonic, so a sleeping device or a
 // clock change adds no on-screen time. `wall` places that time on UTC days.
 private span:{mono:number;wall:number}|undefined;
 // Monotonic time of the later of the return to the foreground and the last accepted input.
 private engagedAt=-Infinity;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private allowed(){return !DEMO_MODE&&!PREVIEW_DEPLOY&&!isOptedOut();}
 private foreground(){return document.visibilityState==='visible'&&document.hasFocus();}
 private reset(){this.segments=[];this.current=undefined;this.notified=-Infinity;this.run=undefined;this.dirty=false;this.lastActivity=-Infinity;}
 private resume=()=>{
  if(this.span||!this.subscribers.size||!this.allowed()||!this.foreground())return;
  this.engagedAt=performance.now();this.span={mono:this.engagedAt,wall:Date.now()};this.arm();
 };
 private endSpan(){clearTimeout(this.timer);this.span=undefined;}
 private pause(){if(this.span){this.accrue();this.endSpan();}}
 // Credits the span up to now, or up to the idle cap, where timing stops.
 private accrue(){
  const mono=performance.now(),cap=this.engagedAt+IDLE_MS;
  let from=this.span!.wall,crossed=false;
  const end=from+Math.min(mono,cap)-this.span!.mono;
  while(from<end){
   const day=dayOf(from),until=Math.min(end,day+DAY),ms=(this.onScreen.get(day)??0)+until-from;
   this.onScreen.set(day,ms);from=until;
   if(ms>=ENGAGED_ON_SCREEN_MS&&!this.seen.has(day)&&this.allowed()){this.seen.add(day);crossed=true;}
  }
  if(mono<cap)this.span={mono,wall:Date.now()};else this.endSpan();
  if(crossed&&canScheduleMinuteActivity(this.tool))for(const notify of this.subscribers)notify();
 }
 private arm(){
  clearTimeout(this.timer);
  const now=Date.now(),day=dayOf(now),ms=this.onScreen.get(day)??0;
  const crossing=ms>=ENGAGED_ON_SCREEN_MS?day+DAY-now+ENGAGED_ON_SCREEN_MS:ENGAGED_ON_SCREEN_MS-ms;
  this.timer=setTimeout(()=>{this.accrue();if(this.span)this.arm();},Math.min(crossing,this.engagedAt+IDLE_MS-performance.now()));
 }
 // Input moves the idle cap. Time between the old cap and this input stays uncredited.
 private engage(){
  const mono=performance.now();
  if(this.span&&mono>=this.engagedAt+IDLE_MS)this.accrue();
  this.engagedAt=mono;this.resume();
 }
 private stop=()=>{this.pause();this.current=undefined;this.run=undefined;if(this.dirty){this.dirty=false;if(canScheduleMinuteActivity(this.tool))for(const notify of this.subscribers)notify();}};
 private visibility=()=>{if(document.visibilityState==='visible')this.resume();else this.stop();};
 private activity=(event:Event)=>{
  if(!this.allowed()){recordMinuteActivity(this.tool,'',Date.now());this.reset();return;}
  if(!event.isTrusted||!this.foreground())return;
  if(event instanceof PointerEvent&&event.type==='pointermove'&&!event.buttons)return;
  this.engage();
  const now=Date.now();
  const rollback=now<this.lastActivity;
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
  if(now-this.notified>=60_000&&canScheduleMinuteActivity(this.tool)){this.notified=now;this.dirty=false;for(const notify of this.subscribers)notify();}
 };
 private events=['pointerdown','pointermove','keydown','wheel','touchstart','touchmove','input','change'];
 subscribe(notify:()=>void){
  if(!this.subscribers.size){
   for(const event of this.events)window.addEventListener(event,this.activity,{capture:true,passive:true});
   document.addEventListener('visibilitychange',this.visibility);window.addEventListener('focus',this.resume);window.addEventListener('blur',this.stop);window.addEventListener('pagehide',this.stop);
  }
  this.subscribers.add(notify);this.resume();
  return ()=>{
   if(this.subscribers.size===1)this.stop();
   this.subscribers.delete(notify);
   if(!this.subscribers.size){
    for(const event of this.events)window.removeEventListener(event,this.activity,true);
    document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('focus',this.resume);window.removeEventListener('blur',this.stop);window.removeEventListener('pagehide',this.stop);this.stop();
   }
  };
 }
 seenDays():number[]|undefined {
  if(!this.allowed()){this.seen.clear();return undefined;}
  return this.seen.size?[...this.seen].sort((a,b)=>a-b).slice(-8):undefined;
 }
 snapshot():AttentionPayload|undefined {
  if(!this.allowed()){this.reset();return undefined;}
  return this.segments.length?{v:1,segments:this.segments.map(s=>({...s}))}:undefined;
 }
}
const trackers:Record<Tool,AttentionTracker>={dex:new AttentionTracker('dex'),league:new AttentionTracker('league'),favorites:new AttentionTracker('favorites')};
export const attentionPayload=(tool:Tool)=>trackers[tool].snapshot();
export const seenPayload=(tool:Tool)=>trackers[tool].seenDays();
export const subscribeAttention=(tool:Tool,notify:()=>void)=>trackers[tool].subscribe(notify);
