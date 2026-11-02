import {expect,test,type Page} from '@playwright/test';
import {filledSlotsLeague} from './support/leagueSeed';

type Segment={id:string;start:number;end:number};
type Payload={attention?:{v:1;segments:Segment[]};seen?:number[];ts?:number};
const tools=[{name:'Dex',path:'/pokedex-builder',api:'submit'},{name:'League',path:'/custom-gym-leader',api:'league'},{name:'Picker',path:'/favorite-pokemon-picker',api:'favorites'}];
const minute=60_000;
const t0=Date.UTC(2026,9,10)+1000,day0=Date.UTC(2026,9,10);
const mounted=(page:Page)=>expect(page.locator('#root > .p151-boot, #root > .lg-shell, #root > .fv-shell')).toHaveCount(0);
function measured(posts:Payload[]) {const segments=posts.at(-1)?.attention?.segments??[];return {segments,total:segments.reduce((sum,s)=>sum+s.end-s.start,0)};}
async function boot(page:Page,tool:typeof tools[number],optedOut=false,input=true) {
 const posts:Payload[]=[];
 await page.addInitScript(()=>{
   localStorage.setItem('personal-151-pokedex-v3',JSON.stringify({state:{sections:{starter:[1]}},version:10}));
   localStorage.setItem('favorite-picker',JSON.stringify({state:{fills:{'water|1':7}},version:3}));
 });
 if(tool.name==='League')await filledSlotsLeague(page,[0]);
 await page.route(`**/api/${tool.api}`,async route=>{posts.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}});});
 await page.route('**/api/event',route=>route.fulfill({json:{ok:true}}));
 await page.clock.install({time:t0-1000});await page.clock.pauseAt(t0);
 await page.goto(`${tool.path}${optedOut?'?notme':''}`);await expect(page.locator('main').first()).toBeVisible();await mounted(page);
 await page.bringToFront();
 if(!input)return posts;
 if(!optedOut)await expect.poll(async()=>{await page.clock.runFor(5000);return posts.length;}).toBeGreaterThan(0);
 await page.keyboard.press('ArrowRight');
 return posts;
}
async function wheel(page:Page) {
 const delivered=page.evaluate(()=>new Promise<void>(resolve=>window.addEventListener('wheel',()=>resolve(),{once:true})));
 await page.mouse.wheel(0,10);await delivered;
}
async function foreground(page:Page,visible:boolean,focused:boolean) {
 await page.evaluate(({visible,focused})=>{
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible?'visible':'hidden'});
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>!visible});
   Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>focused});
   document.dispatchEvent(new Event('visibilitychange'));
   window.dispatchEvent(new Event(focused?'focus':'blur'));
 },{visible,focused});
}
for(const tool of tools) {
 test(`${tool.name}: terminal idle ends at last activity; short activity gaps can form a long session`,async({page},info)=>{
   const posts=await boot(page,tool);
   await page.clock.runFor(minute);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
   await expect.poll(()=>posts.at(-1)?.attention).toBeDefined();
   await expect.poll(()=>measured(posts).total).toBe(minute);
   const sent=posts.length;
   await page.clock.runFor(25*minute);expect(posts.length).toBe(sent);
   await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
   await expect.poll(()=>measured(posts).total).toBe(minute);await expect.poll(()=>measured(posts).segments.length).toBe(2);
   await page.clock.runFor(4*minute-5000);await page.keyboard.press('ArrowRight');
   await page.clock.runFor(4*minute);await wheel(page);await page.clock.runFor(5000);
   await expect.poll(()=>measured(posts).total).toBe(9*minute);await expect.poll(()=>measured(posts).segments.length).toBe(2);
   await page.clock.runFor(5*minute-5000);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
   await expect.poll(()=>measured(posts).total).toBe(9*minute);await expect.poll(()=>measured(posts).segments.length).toBe(3);
   await info.attach('foreground-chain-and-idle',{body:JSON.stringify({tool:tool.name,activeMs:measured(posts).total,segments:measured(posts).segments.map(s=>({start:s.start-t0,end:s.end-t0}))}),contentType:'application/json'});
 });
 test(`${tool.name}: hidden and blurred time is excluded; non-build activity and pagehide flush are retained`,async({page},info)=>{
   const posts=await boot(page,tool);
   await page.clock.runFor(minute);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
   await expect.poll(()=>measured(posts).total).toBe(minute);
   await foreground(page,false,false);await page.clock.runFor(20*minute);await page.keyboard.press('ArrowRight');
   await foreground(page,true,false);await page.clock.runFor(minute);await page.keyboard.press('ArrowRight');
   await foreground(page,true,true);await page.keyboard.press('ArrowRight');
   await page.clock.runFor(30_000);await wheel(page);
   await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
   await expect.poll(()=>measured(posts).total).toBe(90_000);
   const afterFlush=posts.length;
   await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.clock.runFor(5000);
   expect(posts.length).toBe(afterFlush);
   await expect.poll(()=>measured(posts).segments.length).toBe(2);
   await info.attach('foreground-lifecycle',{body:JSON.stringify({tool:tool.name,activeMs:measured(posts).total,segments:2,duplicatePagehideWrites:0}),contentType:'application/json'});
 });
 test(`${tool.name}: opt-out suppresses all foreground reports`,async({page},info)=>{
   const posts=await boot(page,tool,true);
   await page.clock.runFor(minute);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
   await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));expect(posts).toEqual([]);
   await info.attach('excluded-foreground',{body:JSON.stringify({tool:tool.name,reports:posts.length}),contentType:'application/json'});
 });
 test(`${tool.name}: 10 seconds on screen without input reports the day as seen`,async({page},info)=>{
   const posts=await boot(page,tool,false,false);
   await page.clock.runFor(11_000);
   await foreground(page,false,false);
   await expect.poll(()=>posts.at(-1)?.seen).toEqual([day0]);
   expect(posts[0].ts).toBe(t0);
   expect(posts.some(p=>p.attention)).toBe(false);
   await info.attach('seen-without-input',{body:JSON.stringify({tool:tool.name,onScreenMs:11_000,inputEvents:0,seen:posts.at(-1)!.seen!.map(d=>new Date(d).toISOString().slice(0,10))}),contentType:'application/json'});
 });
 test(`${tool.name}: on-screen time stops 30 minutes after input, so a tab left on screen overnight needs input the next day`,async({page},info)=>{
   const posts=await boot(page,tool,false,false);
   const day1=day0+86_400_000,day2=day1+86_400_000;
   const seenOn=(day:number)=>posts.filter(p=>p.seen?.includes(day)).length;
   const runTo=async(ms:number)=>page.clock.runFor(ms-await page.evaluate(()=>Date.now()));
   await runTo(day1+20_000);
   await page.keyboard.press('ArrowRight');
   await page.clock.runFor(9_000);
   await expect.poll(()=>posts.some(p=>p.attention)).toBe(true);
   const idleNextDay=seenOn(day1);
   expect(idleNextDay).toBe(0);
   await page.clock.runFor(6_000);
   await expect.poll(()=>seenOn(day1)).toBeGreaterThan(0);
   await runTo(day2-15*minute);await page.keyboard.press('ArrowRight');
   await runTo(day2+20_000);
   await expect.poll(()=>seenOn(day2)).toBeGreaterThan(0);
   await info.attach('seen-idle-cap',{body:JSON.stringify({tool:tool.name,seenNextDayBeforeTenSecondsOfInput:idleNextDay,
     inputBeforeMidnightMs:15*minute,seen:posts.at(-1)!.seen!.map(d=>new Date(d).toISOString().slice(0,10))}),contentType:'application/json'});
 });
 test(`${tool.name}: background time is not on screen; on-screen time adds up within the day`,async({page},info)=>{
   const posts=await boot(page,tool,false,false);
   await page.clock.runFor(5000);
   await foreground(page,false,false);await page.clock.runFor(minute);
   const returned=await page.evaluate(()=>Date.now());
   await foreground(page,true,true);await page.clock.runFor(5000);
   await foreground(page,false,false);
   await expect.poll(()=>posts.at(-1)?.seen).toEqual([day0]);
   expect(posts[0].ts).toBe(t0);
   const early=posts.filter(p=>p.seen&&p.ts!<returned);
   expect(early).toEqual([]);
   await info.attach('seen-excludes-background',{body:JSON.stringify({tool:tool.name,onScreenMs:[5000,5000],backgroundMs:minute,seenBeforeReturn:early.length,seen:posts.at(-1)!.seen!.map(d=>new Date(d).toISOString().slice(0,10))}),contentType:'application/json'});
 });
 test(`${tool.name}: reload gets a new segment ID without resending old measured time`,async({page},info)=>{
   const posts=await boot(page,tool);
   await page.clock.runFor(minute);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
   await expect.poll(()=>posts.at(-1)?.attention).toBeDefined();
   const old=measured(posts).segments[0].id;
   const beforeReload=posts.length;
   await page.reload();await expect(page.locator('main').first()).toBeVisible();await mounted(page);await page.bringToFront();
   await expect.poll(async()=>{await page.clock.runFor(5000);return posts.length;}).toBeGreaterThan(beforeReload);
   await page.keyboard.press('ArrowRight');
   await page.clock.runFor(minute);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
   await expect.poll(()=>measured(posts).segments[0]?.id).not.toBe(old);await expect.poll(()=>measured(posts).total).toBe(minute);
   await info.attach('foreground-reload',{body:JSON.stringify({tool:tool.name,newSegment:true,pageActiveMs:measured(posts).total}),contentType:'application/json'});
 });
}

test('clock correction removes future intervals without preventing subsequent foreground collection',async({page},info)=>{
 const posts=await boot(page,tools[0]);
 await page.clock.runFor(minute);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
 await expect.poll(()=>measured(posts).total).toBe(minute);
 await page.clock.setSystemTime(t0+60*minute);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
 await expect.poll(()=>Math.max(...measured(posts).segments.map(s=>s.end))).toBe(t0+60*minute);
 await page.clock.setSystemTime(t0+2*minute);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
 await expect.poll(()=>measured(posts).segments.every(s=>s.end<=t0+2*minute)).toBe(true);
 await page.clock.runFor(minute-5000);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
 await expect.poll(()=>measured(posts).total).toBe(minute);
 await info.attach('corrected-clock',{body:JSON.stringify({futureIntervals:0,resumedActiveMs:minute}),contentType:'application/json'});
});
