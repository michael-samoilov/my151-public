import {expect,test,type Page} from '@playwright/test';
import {filledSlotsLeague} from './support/leagueSeed';
import type {MinuteActivityPayload} from '../api/_minuteActivity';
type Post={activity?:MinuteActivityPayload;attention?:{segments:{start:number;end:number}[]};seen?:number[]};
const tools=[{name:'Dex',path:'/pokedex-builder',api:'submit'},{name:'League',path:'/custom-gym-leader',api:'league'},{name:'Picker',path:'/favorite-pokemon-picker',api:'favorites'}];
const start=Date.UTC(2026,9,10,12);
async function boot(page:Page,tool:typeof tools[number],mode:{ack:boolean;paused?:boolean}={ack:true},optedOut=false){
 const posts:Post[]=[];
 await page.addInitScript(()=>{
  localStorage.setItem('personal-151-pokedex-v3',JSON.stringify({state:{sections:{starter:[1]}},version:10}));
  localStorage.setItem('favorite-picker',JSON.stringify({state:{fills:{'water|1':7}},version:3}));
 });
 if(tool.name==='League')await filledSlotsLeague(page,[0]);
 await page.route(`**/api/${tool.api}`,async route=>{
  const post=route.request().postDataJSON() as Post;posts.push(post);
  await route.fulfill({json:{ok:true,...(mode.ack?{activityAck:{accepted:mode.paused?[]:post.activity?.batches.map(b=>b.id)??[],status:mode.paused?'paused':'recorded',...(mode.paused?{retryAt:start+10*60_000}:{})}}:{})}});
 });
 await page.route('**/api/event',route=>route.fulfill({json:{ok:true}}));
 // platform: Playwright's installed clock runs until paused, so it installs a minute early to keep pauseAt(start) in the future.
 await page.clock.install({time:start-60_000});await page.clock.pauseAt(start);
 await page.goto(tool.path+(optedOut?'?notme':''));await expect(page.locator('main').first()).toBeVisible();await page.bringToFront();
 if(!optedOut)await expect.poll(async()=>{await page.clock.runFor(5000);return posts.length;}).toBeGreaterThan(0);
 // Ten seconds on screen sends one seen-day beacon. Wait for it, so the request counts start after it.
 if(!optedOut)await expect.poll(async()=>{await page.clock.runFor(5000);return posts.some(p=>p.seen);}).toBe(true);
 return posts;
}
async function activity(page:Page){await page.keyboard.press('ArrowRight');}
async function depart(page:Page){await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));}
const buckets=(posts:Post[])=>posts.flatMap(p=>p.activity?.batches.flatMap(b=>b.buckets)??[]);
for(const tool of tools){
 test(`${tool.name}: minute history retains 59-second and 60-second gaps and foreground boundaries`,async({page},info)=>{
  const posts=await boot(page,tool);
  await activity(page);await page.clock.runFor(5000);
  await expect.poll(()=>buckets(posts).length).toBeGreaterThan(0);
  const first=buckets(posts)[0].first;
  await page.clock.runFor(54_000);await activity(page);
  await page.clock.runFor(60_000);await activity(page);await page.clock.runFor(5000);
  await depart(page);await expect.poll(()=>buckets(posts).some(b=>b.last===first+119_000)).toBe(true);
  const points=[...new Set(buckets(posts).flatMap(b=>[b.first,b.last]))].sort((a,b)=>a-b);
  expect(points).toEqual([first,first+59_000,first+119_000]);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.clock.runFor(10_000);await activity(page);await depart(page);
  await expect.poll(()=>new Set(buckets(posts).map(b=>b.run)).size).toBe(2);
  await info.attach('minute-boundaries',{body:JSON.stringify({tool:tool.name,gaps:[59_000,60_000],foregroundRuns:2}),contentType:'application/json'});
 });
}
test('unacknowledged minute batches survive reload unchanged; acknowledgements remove them',async({page},info)=>{
 const mode={ack:false};const posts=await boot(page,tools[0],mode);
 await activity(page);await page.clock.runFor(5000);
 await expect.poll(()=>posts.at(-1)?.activity).toBeDefined();
 const batch=posts.at(-1)!.activity!.batches[0];
 await page.reload();await expect(page.locator('main').first()).toBeVisible();
 await expect.poll(async()=>{await page.clock.runFor(5000);return posts.filter(p=>p.activity?.batches.some(b=>b.id===batch.id)).length;}).toBeGreaterThan(1);
 expect(posts.at(-1)!.activity!.batches.find(b=>b.id===batch.id)).toEqual(batch);
 mode.ack=true;await activity(page);await page.clock.runFor(5000);
 await expect.poll(async()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('p151-minute-history-v1')??'{}').states?.dex?.pending?.length)).toBe(0);
 await info.attach('immutable-retry',{body:JSON.stringify({reloadRetriedSameBatch:true,acknowledgedPending:0}),contentType:'application/json'});
});
test('continuous non-build activity schedules at most once per minute; idle does not send',async({page},info)=>{
 const posts=await boot(page,tools[0]);const baseline=posts.length;
 for(let n=0;n<13;n++){await activity(page);await page.clock.runFor(5000);}
 await expect.poll(()=>posts.length).toBe(baseline+2);
 await activity(page);await depart(page);await expect.poll(()=>posts.length).toBe(baseline+3);
 const after=posts.length;await page.clock.runFor(600_000);expect(posts.length).toBe(after);
 await info.attach('request-budget',{body:JSON.stringify({activitySeconds:65,scheduled:2,departure:1,idleRequests:0}),contentType:'application/json'});
});
test('paused history stops attention-only requests; resumption marks loss and opt-out erases history',async({page},info)=>{
 const mode={ack:true,paused:false};const posts=await boot(page,tools[0],mode);mode.paused=true;
 await activity(page);await page.clock.runFor(5000);await expect.poll(()=>buckets(posts).length).toBeGreaterThan(0);
 await expect.poll(async()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('p151-minute-history-v1')??'{}').states?.dex?.pauseUntil)).toBe(start+10*60_000);
 const sent=posts.length;await page.clock.runFor(60_000);await activity(page);await page.clock.runFor(5000);
 await depart(page);await page.clock.runFor(5000);expect(posts.length).toBe(sent);
 mode.paused=false;await page.clock.setSystemTime(start+11*60_000);await activity(page);await page.clock.runFor(5000);
 await expect.poll(()=>posts.length).toBe(sent+1);expect(posts.at(-1)?.attention).toBeDefined();
 expect(posts.at(-1)?.activity?.batches.some(b=>b.incomplete)).toBe(true);
 await page.goto('/pokedex-builder?notme');await expect(page.locator('main').first()).toBeVisible();
 await activity(page);await page.clock.runFor(5000);
 expect(await page.evaluate(()=>sessionStorage.getItem('p151-minute-history-v1'))).toBeNull();
 await info.attach('pause-and-exclusion',{body:JSON.stringify({pausedAttentionRequests:0,resumedIncomplete:true,existingSummary:true,optOutPending:false}),contentType:'application/json'});
});
