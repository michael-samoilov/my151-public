import {expect,test,type Page} from '@playwright/test';
import {filledSlotsLeague} from './support/leagueSeed';

type Segment={id:string;start:number;end:number};
type Payload={attention?:{v:1;segments:Segment[]}};
const tools=[{name:'Dex',path:'/pokedex-builder',api:'submit'},{name:'League',path:'/custom-gym-leader',api:'league'},{name:'Picker',path:'/favorite-pokemon-picker',api:'favorites'}];
const minute=60_000;
const t0=Date.UTC(2026,9,10)+1000;
function measured(posts:Payload[]) {const segments=posts.at(-1)?.attention?.segments??[];return {segments,total:segments.reduce((sum,s)=>sum+s.end-s.start,0)};}
async function boot(page:Page,tool:typeof tools[number],optedOut=false) {
 const posts:Payload[]=[];
 await page.addInitScript(()=>{
   localStorage.setItem('personal-151-pokedex-v3',JSON.stringify({state:{sections:{starter:[1]}},version:10}));
   localStorage.setItem('favorite-picker',JSON.stringify({state:{fills:{'water|1':7}},version:3}));
 });
 if(tool.name==='League')await filledSlotsLeague(page,[0]);
 await page.route(`**/api/${tool.api}`,async route=>{posts.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}});});
 await page.route('**/api/event',route=>route.fulfill({json:{ok:true}}));
 await page.clock.install({time:t0-1000});await page.clock.pauseAt(t0);
 await page.goto(`${tool.path}${optedOut?'?notme':''}`);await expect(page.locator('main').first()).toBeVisible();
 await page.bringToFront();
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
   await expect.poll(()=>posts.at(-1)?.attention).toBeDefined();
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
 test(`${tool.name}: reload gets a new segment ID without resending old measured time`,async({page},info)=>{
   const posts=await boot(page,tool);
   await page.clock.runFor(minute);await page.keyboard.press('ArrowRight');await page.clock.runFor(5000);
   await expect.poll(()=>posts.at(-1)?.attention).toBeDefined();
   const old=measured(posts).segments[0].id;
   await page.reload();await expect(page.locator('main').first()).toBeVisible();await page.keyboard.press('ArrowRight');
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
