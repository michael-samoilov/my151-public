import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { auditBody, APP_HARD_KINDS } from '../.claude/skills/render-audit/audit-core.mjs';
const base=process.env.ART_BASE_URL || 'http://127.0.0.1:4377';
const out=resolve(process.env.ART_CAPTURE_DIR || 'docs/evidence/tool-art-rebake/local');
mkdirSync(out,{recursive:true});
const wanted=process.argv.slice(2); const has=name=>!wanted.length||wanted.includes(name);
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const reports=(()=>{try{return JSON.parse(readFileSync(resolve(out,'capture-audit.json'),'utf8'))}catch{return []}})();
const sourceRef=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceRefs=(()=>{try{return JSON.parse(readFileSync(resolve(out,'source-refs.json'),'utf8'))}catch{return {}}})();
function source(name){sourceRefs[name]=sourceRef;writeFileSync(resolve(out,'source-refs.json'),JSON.stringify(sourceRefs,null,2))}
async function audit(page,name,checkFrame=false){
 const result=await page.evaluate(`(()=>{${auditBody({minFont:12,annotate:false,checkFrame})}})()`);
 const hard=result.findings.filter(f=>APP_HARD_KINDS.includes(f.kind)||f.kind==='stretched-box');
 const previous=reports.findIndex(report=>report.name===name);if(previous>=0)reports.splice(previous,1);
 reports.push({name,...result,hardCount:hard.length});
 if(hard.length)throw Error(JSON.stringify({name,hard}));
}
async function blob(page,name){
 const image=page.locator('[data-export-preview] img');await image.waitFor({timeout:90000});
 await image.evaluate(el=>el.decode());
 const raw=await image.evaluate(async el=>{const b=await(await fetch(el.src)).blob();return Array.from(new Uint8Array(await b.arrayBuffer()))});
 writeFileSync(resolve(out,`${name}.png`),Buffer.from(raw));source(name);
 const native=await browser.newPage();
 await native.setContent(`<style>*{margin:0}img{display:block}</style><img data-audit-scale="intended" src="data:image/png;base64,${Buffer.from(raw).toString('base64')}">`);
 await native.locator('img').evaluate(el=>el.decode());
 const dimensions=await native.locator('img').evaluate(el=>({width:el.naturalWidth,height:el.naturalHeight}));
 await native.setViewportSize(dimensions);await audit(native,name,true);await native.close();
 console.log(name,'native PNG captured and audited');
}
async function phonePage(tab,name){
 const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
 if(tab==='build')await p.addInitScript(()=>{
  const sections={starter:[387,388,389,255,256,257,656,657,658],'early-bug':[736,737,738,543,544,545,123,212,900],forest:[46,47,453,454,708,709,56,57,979,273,274,275,216,217,901,252,253,254,640]};
  localStorage.setItem('personal-151-pokedex-v3',JSON.stringify({state:{sections,milestoneMax:37,milestoneCelebrated:[25],localeNoticeSeen:true,locale:'en'},version:10}));
  localStorage.setItem('p151-league-promo-seen','1');localStorage.setItem('p151-moved-notice-seen','1');
 });
 await p.goto(`${base}/pokedex-builder?${tab==='build'?'':'demo=151&'}notme`);await p.locator(`[data-nav="${tab==='build'?'builder':tab}"]`).first().click();
 await p.waitForTimeout(1000);
 const chrome=await p.evaluate(()=>Math.ceil(Math.max(document.querySelector('header')?.getBoundingClientRect().bottom||0,...[...document.querySelectorAll('.milestone-bar')].map(b=>b.getBoundingClientRect().width?b.closest('.border-b')?.getBoundingClientRect().bottom||0:0))));
 await p.setViewportSize({width:390,height:844+chrome});
 if(tab==='analytics')await p.evaluate(top=>{const h=[...document.querySelectorAll('h1,h2,h3')].find(h=>h.textContent.trim()==='Pokémon Type');if(!h)throw Error('missing type heading');const s=h.closest('.overflow-y-auto')||document.scrollingElement;s.scrollTop+=h.getBoundingClientRect().top-top-16},chrome);
 await p.waitForTimeout(1000);await p.locator('img').evaluateAll(images=>Promise.all(images.filter(i=>i.getBoundingClientRect().width&&i.getBoundingClientRect().top<innerHeight).map(i=>i.decode().catch(()=>null))));
 await audit(p,name);await p.screenshot({path:resolve(out,`${name}-whole.png`),fullPage:true});

 const clip=tab==='build'
  ? await p.locator('[data-build-scroll]').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.left+el.clientLeft,y:r.top+el.clientTop,width:el.clientWidth,height:844}})
  : {x:0,y:chrome,width:390,height:844};
 await p.screenshot({path:resolve(out,`${name}.png`),clip});source(name);await p.close();
}
try{
 if(has('league')||has('league-summary')){
 const ctx=await browser.newContext({viewport:{width:1280,height:900}});
 const seed=readFileSync('docs/future-tools/home-page/league-fixture.json','utf8');
 await ctx.addInitScript(seed=>{localStorage.setItem('league-builder',seed);localStorage.setItem('my151-opt-out','1')},seed);
 const p=await ctx.newPage();await p.goto(`${base}/custom-gym-leader?notme`);
 await p.locator('[data-testid="league-slot-0"]').waitFor();await p.locator('[data-league-export="league"]').first().click();
 await p.locator('[data-league-export-confirm]:not([disabled])').waitFor({timeout:90000});await blob(p,'league-story');
 if(has('league')){await p.goto(`${base}/custom-gym-leader?notme`);await p.locator('[data-testid="league-slot-0"]').click();await p.locator('[data-league-export="card"]').first().click();await p.locator('[data-league-export-confirm]:not([disabled])').waitFor({timeout:90000});await blob(p,'trainer-brock');}await ctx.close();
 }
 if(has('favorites')){
 const p=await browser.newPage({viewport:{width:1280,height:900}});
 await p.goto(`${base}/docs/favorite-picker-work/export/portrait/index.html`);await p.waitForFunction(()=>window.ready,{timeout:90000});await audit(p,'picker-portrait-comparison');
 const data=await p.evaluate(()=>window.portrait.data);for(const [i,name]of ['picker-full-portrait','picker-simplified-portrait','picker-full-horizontal','picker-simplified-horizontal','picker-full-icons'].entries()){writeFileSync(resolve(out,`${name}.png`),Buffer.from(data[i].split(',')[1],'base64'));source(name)}await p.close();
 }
 if(has('dex-share')){
 const p=await browser.newPage({viewport:{width:1280,height:900}});
 await p.goto(`${base}/pokedex-builder?demo=151&notme`);await p.locator('[data-nav="view"]').first().click();await p.locator('[data-dex-export]').click();
 await p.locator('[data-dex-export-confirm]:not([disabled])').waitFor({timeout:90000});
 const outlines=p.locator('[data-export-outlines]');
 if((await outlines.getAttribute('class')).includes('bg-primary/10'))await outlines.click();
 const stats=p.locator('[data-export-stats]');
 if(!(await stats.getAttribute('class')).includes('bg-primary/10'))await stats.click();
 await p.locator('[data-dex-export-confirm]:not([disabled])').waitFor({timeout:90000});
 await blob(p,'dex-share-stats');await p.close();
 }
 if(has('dex-plain')){
 const p=await browser.newPage({viewport:{width:1280,height:900}});
 await p.goto(`${base}/pokedex-builder?demo=151&notme`);await p.locator('[data-nav="view"]').first().click();await p.locator('[data-dex-export]').click();
 await p.locator('[data-dex-export-confirm]:not([disabled])').waitFor({timeout:90000});
 const outlines=p.locator('[data-export-outlines]');
 if((await outlines.getAttribute('class')).includes('bg-primary/10'))await outlines.click();
 const stats=p.locator('[data-export-stats]');
 if((await stats.getAttribute('class')).includes('bg-primary/10'))await stats.click();
 await p.waitForTimeout(1000);await p.locator('[data-dex-export-confirm]:not([disabled])').waitFor({timeout:90000});
 await blob(p,'dex-plain');await p.close();
 }
 if(has('dex')||has('dex-build'))await phonePage('build','dex-build');
 if(has('dex')){
 const p=await browser.newPage({viewport:{width:1280,height:900}});await p.goto(`${base}/pokedex-builder?demo=151&notme`);await p.locator('[data-nav="view"]').first().click();await p.locator('[data-dex-export]').click();await p.locator('[data-dex-export-confirm]:not([disabled])').waitFor({timeout:90000});await blob(p,'dex-grid');await p.locator('[data-export-stats]').click();await p.waitForTimeout(1000);await p.locator('[data-dex-export-confirm]:not([disabled])').waitFor({timeout:90000});await blob(p,'dex-stats');await p.close();
 }
 if(has('audit-native'))for(const name of ['league-story','trainer-brock','picker-full-portrait','picker-simplified-portrait','picker-full-horizontal','picker-simplified-horizontal','dex-grid','dex-stats']){
  const bytes=readFileSync(resolve(out,`${name}.png`));const p=await browser.newPage();
  await p.setContent(`<style>*{margin:0}img{display:block}</style><img data-audit-scale="intended" src="data:image/png;base64,${bytes.toString('base64')}">`);
  await p.locator('img').evaluate(el=>el.decode());const dimensions=await p.locator('img').evaluate(el=>({width:el.naturalWidth,height:el.naturalHeight}));await p.setViewportSize(dimensions);await audit(p,`${name}-whole-artboard`,true);await p.close();
 }
 writeFileSync(resolve(out,'capture-audit.json'),JSON.stringify(reports,null,2));
}finally{await browser.close()}
