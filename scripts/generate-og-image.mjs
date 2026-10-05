#!/usr/bin/env node
/** Render route previews from captured app artwork. Hub artwork is unchanged.
 * Run under flock /tmp/my151-browser.lock. OG_OUT_DIR and OG_HTML_OUT_DIR support review copies.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { auditBody, APP_HARD_KINDS } from '../.claude/skills/render-audit/audit-core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.OG_OUT_DIR||resolve(root,'public');
const evidence=process.env.OG_HTML_OUT_DIR||resolve(root,'docs/evidence/tool-art-rebake/local/og');
const data=(path,mime)=>`data:${mime};base64,${readFileSync(resolve(root,path)).toString('base64')}`;
const font=data('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2','font/woff2');
const tools={
 pokedex:{file:'og-image.png',title:'Custom Region &<br>Pokédex Builder',images:[['build','public/og-sources/dex-build.webp','In-progress Pokédex Build page'],['back','src/assets/home/tool-dex-b.webp','Pokédex export with detailed statistics'],['front','src/assets/home/tool-dex.webp','Custom regional Pokédex export']]},
 league:{file:'og-gym-leader.png',title:'Trainer Card &<br>Gym Leader Maker',images:[['back','src/assets/home/tool-league-b.webp','Kanto league story-team export'],['front','src/assets/home/tool-league.webp','Brock trainer-card export']]},
 favorites:{file:'og-favorite-picker.png',title:'Favorite Pokémon<br>Picker by Type<br>and Generation',images:[['back','src/assets/home/tool-favorites.webp','Simplified portrait favorite Pokémon chart'],['front','src/assets/home/tool-favorites-b.webp','Full grid portrait favorite Pokémon chart']]},
};
const styles=`@font-face{font-family:Inter;src:url('${font}');font-weight:100 900}*{box-sizing:border-box;margin:0}html,body{width:1200px;height:630px;background:#171719;font-family:Inter,sans-serif;color:#fafafa}.frame{width:1200px;height:630px;position:relative}.brand{position:absolute;top:54px;left:56px;font-size:42px;line-height:1.1;font-weight:800;letter-spacing:-1.8px}.brand b{color:#ef3438}.title{position:absolute;left:56px;bottom:58px;width:540px;font-size:54px;line-height:1.09;font-weight:750;letter-spacing:-1.8px}.fan{position:absolute;left:600px;top:0;width:600px;height:630px;overflow:hidden}.shot{position:absolute;object-fit:contain;filter:drop-shadow(0 14px 16px rgba(0,0,0,.4));height:590px;width:auto;border-radius:8px}.back{left:65px;top:130px;height:560px;transform:rotate(-9deg)}.front{right:65px;top:110px;transform:rotate(5deg)}.favorites .title{font-size:52px}.favorites .front{height:620px;top:105px}.favorites .back{height:620px;left:70px;top:85px}.pokedex .build{height:650px;left:26px;top:64px;transform:rotate(-11deg)}.pokedex .back{width:440px;height:auto;left:113px;top:190px;transform:rotate(-4deg)}.pokedex .front{width:440px;height:auto;right:22px;top:275px;transform:rotate(7deg)}`;
const html=(id,tool)=>`<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body><main class="frame ${id}"><div class="brand"><b>my151</b>.app</div><h1 class="title">${tool.title}</h1><!-- Only the artwork fan intentionally continues below the canvas. Copy remains wholly inside. --><div class="fan" data-audit-clip="intended" data-audit-scale="intended">${tool.images.map(([cls,path,alt])=>`<img class="shot ${cls}" src="${data(path,'image/webp')}" alt="${alt}">`).join('')}</div></main></body></html>`;
const names=process.argv.slice(2);
if(names.includes('hub'))execFileSync(process.execPath,[resolve(root,'scripts/generate-og-hub-image.mjs'),'hub'],{env:process.env,stdio:'inherit'});
const wanted=names.length?names.filter(name=>name!=='hub'):Object.keys(tools);
for(const name of wanted)if(!tools[name])throw Error(`Unknown tool ${name}. Use ${[...Object.keys(tools),'hub'].join(', ')}.`);
if(!wanted.length)process.exit(0);
mkdirSync(out,{recursive:true});mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH||process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});const reports=[];
 for(const name of wanted){
  const source=html(name,tools[name]);writeFileSync(resolve(evidence,`${name}.html`),source);
  await page.setContent(source,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  const audit=await page.evaluate(`(()=>{${auditBody({minFont:12,annotate:false,checkFrame:true})}})()`);
  const hard=audit.findings.filter(f=>APP_HARD_KINDS.includes(f.kind)||f.kind==='stretched-box');
  // All export sheets must visibly continue past the bottom edge. No copy may cross it.
  const geometry=await page.locator('.shot').evaluateAll(images=>images.map(i=>({class:i.className,...Object.fromEntries(['top','bottom','left','right'].map(k=>[k,i.getBoundingClientRect()[k]]))})));
  if(geometry.some(g=>g.left<600||g.right>1200||g.top<0))throw Error(`${name}: only bottom-edge cropping is intentional`);
  if(geometry.some(g=>g.bottom<=630))throw Error(`${name}: sheet does not extend below canvas`);
  reports.push({name,...audit,hardCount:hard.length,geometry});if(hard.length)throw Error(JSON.stringify(hard));
  const path=resolve(out,tools[name].file);await page.screenshot({path});console.log(`Wrote ${path} (1200x630)`);
 }
 writeFileSync(resolve(evidence,'audit.json'),JSON.stringify(reports,null,2));
}finally{await browser.close()}
