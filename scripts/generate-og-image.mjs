#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { auditBody, APP_HARD_KINDS } from '../.claude/skills/render-audit/audit-core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.OG_OUT_DIR||resolve(root,'public');
const evidence=process.env.OG_HTML_OUT_DIR||resolve(root,'docs/evidence/tool-art-rebake/local/og');
const data=(path,mime)=>`data:${mime};base64,${readFileSync(resolve(root,path)).toString('base64')}`;
const JPEG="import sys;from PIL import Image;Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2],'JPEG',quality=90,subsampling=0,optimize=True,progressive=True)";
const font=data('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2','font/woff2');
const tools={

 hub:{file:'og-hub.jpg',title:'Free<br>Pokémon<br>Fan Tools',fan:{left:350,center:413,width:480,spread:174,step:7},images:[['back','src/assets/home/tool-favorites-b.webp','Full grid portrait favorite Pokémon chart'],['middle','public/og-sources/dex-stats.webp','Custom regional Pokédex export with detailed statistics'],['front','src/assets/home/tool-league.webp','Brock trainer-card export']]},
 pokedex:{file:'og-image.jpg',title:'Custom Region &<br>Pokédex Builder',images:[['build','public/og-sources/dex-build.webp','In-progress Pokédex Build page'],['front','public/og-sources/dex-stats.webp','Custom regional Pokédex export with detailed statistics and no section outlines']]},
 league:{file:'og-gym-leader.jpg',title:'Trainer Card &<br>Gym Leader Maker',images:[['back','src/assets/home/tool-league-b.webp','Kanto league story-team export'],['front','src/assets/home/tool-league.webp','Brock trainer-card export']]},
 favorites:{file:'og-favorite-picker.jpg',title:'Favorite Pokémon<br> Picker by Type &amp; Gen',images:[['back','src/assets/home/tool-favorites.webp','Summary portrait favorite Pokémon chart'],['front','src/assets/home/tool-favorites-b.webp','Full grid portrait favorite Pokémon chart']]},
};
const FAN_TOP = 140;
const FAN_REAR_SHIFT = 24;
const FAN = { left: 600 - FAN_REAR_SHIFT, center: 300, width: 480, spread: 100, step: 7 };
const fanOf = tool => ({ ...FAN, ...tool.fan });
const styles=`@font-face{font-family:Inter;src:url('${font}');font-weight:100 900}*{box-sizing:border-box;margin:0}html,body{width:1200px;height:630px;background:#171719;font-family:Inter,sans-serif;color:#fafafa}.frame{width:1200px;height:630px;position:relative}.brand{position:absolute;top:54px;left:56px;font-size:42px;line-height:1.1;font-weight:800;letter-spacing:-1.8px}.brand b{color:#ef3438}.title{position:absolute;left:56px;bottom:58px;width:max-content;max-width:540px;font-size:54px;line-height:1.09;font-weight:750;letter-spacing:-1.8px}.fan{position:absolute;top:0;height:630px;overflow:hidden}.shot{position:absolute;top:${FAN_TOP}px;height:auto;transform-origin:50% 0;object-fit:contain;filter:drop-shadow(0 14px 16px rgba(0,0,0,.4));border-radius:8px}.favorites .title{font-size:52px}`;
const html=(id,tool,fan=fanOf(tool))=>`<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body><main class="frame ${id}"><div class="brand"><b>my151</b>.app</div><h1 class="title">${tool.title}</h1><!-- Only the artwork fan intentionally continues below the canvas. Copy remains wholly inside. --><div class="fan" data-audit-clip="intended" data-audit-scale="intended" style="left:${fan.left}px;width:${1200 - fan.left}px">${tool.images.map(([cls,path,alt],index)=>`<img class="shot ${cls}" style="left:${fan.center - fan.width / 2 + (index - (tool.images.length - 1) / 2) * fan.spread + (index === 0 ? 0 : FAN_REAR_SHIFT)}px;width:${fan.width}px;transform:rotate(${(index - (tool.images.length - 1) / 2) * fan.step}deg)" src="${data(path,'image/webp')}" alt="${alt}">`).join('')}</div></main></body></html>`;
const names=process.argv.slice(2);
const wanted=names.length?names:Object.keys(tools);
for(const name of wanted)if(!tools[name])throw Error(`Unknown tool ${name}. Use ${Object.keys(tools).join(', ')}.`);
mkdirSync(out,{recursive:true});mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH||process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});const reports=[];
 for(const name of wanted){
  const fan=fanOf(tools[name]);const source=html(name,tools[name]);writeFileSync(resolve(evidence,`${name}.html`),source);
  await page.setContent(source,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  const audit=await page.evaluate(`(()=>{${auditBody({minFont:12,annotate:false,checkFrame:true})}})()`);
  const hard=audit.findings.filter(f=>APP_HARD_KINDS.includes(f.kind)||f.kind==='stretched-box');
  const geometry=await page.locator('.shot').evaluateAll(images=>images.map(i=>({class:i.className,width:parseFloat(getComputedStyle(i).width),anchorY:parseFloat(getComputedStyle(i).top),angle:Math.atan2(new DOMMatrixReadOnly(getComputedStyle(i).transform).b,new DOMMatrixReadOnly(getComputedStyle(i).transform).a)*180/Math.PI,...Object.fromEntries(['top','bottom','left','right'].map(k=>[k,i.getBoundingClientRect()[k]]))})));
  if(geometry.some(g=>Math.abs(g.width-fan.width)>0.05||Math.abs(g.anchorY-FAN_TOP)>0.05))throw Error(`${name}: unequal top-edge width or top anchor`);
  if(geometry.slice(1).some((g,index)=>Math.abs(g.angle-geometry[index].angle-fan.step)>0.05))throw Error(`${name}: unequal fan angle increment`);
  const cropped=geometry.filter(g=>g.left<fan.left||g.right>1200||g.top<0);
  if(cropped.length)throw Error(`${name}: only bottom-edge cropping is intentional ${JSON.stringify(cropped.map(({class:c,left,right,top})=>({class:c,left,right,top})))}`);
  if(geometry.some(g=>g.bottom<=630))throw Error(`${name}: sheet does not extend below canvas`);
  const title=await page.locator('.title').evaluate(el=>({text:el.textContent,lines:Math.round(el.getBoundingClientRect().height/parseFloat(getComputedStyle(el).lineHeight)),...Object.fromEntries(['top','bottom','left','right'].map(k=>[k,el.getBoundingClientRect()[k]]))}));
  if(name==='favorites' && (title.lines!==2 || title.text!=='Favorite Pokémon Picker by Type & Gen'))throw Error(`${name}: title must fit the requested two lines`);
  const titleGap=await page.locator('.shot').evaluateAll((images,title)=>Math.min(...images.map(image=>{
    const style=getComputedStyle(image);const m=new DOMMatrixReadOnly(style.transform);
    const origin=parseFloat(style.transformOrigin.split(' ')[0]);const parent=image.parentElement.getBoundingClientRect();
    const topLeftX=parent.left+parseFloat(style.left)+origin-m.a*origin;
    const topLeftY=parent.top+parseFloat(style.top)-m.b*origin;
    const edgeX=y=>topLeftX+(y-topLeftY)*m.c/m.d;
    return Math.min(edgeX(title.top),edgeX(title.bottom))-title.right;
  })),title);
  if(titleGap<6)throw Error(`${name}: artwork approaches title by less than 6px`);
  reports.push({name,...audit,hardCount:hard.length,titleGap,geometry:geometry.map(g=>({...g,hiddenBottom:g.bottom-630})),title});if(hard.length)throw Error(JSON.stringify(hard));
  const path=resolve(out,tools[name].file);const master=resolve(evidence,`${name}.png`);await page.screenshot({path:master});
  // platform: Chrome's JPEG encoder halves colour resolution and blurs the title's edges, so Pillow encodes the JPEG instead.
  const encoded=spawnSync('python3',['-I','-c',JPEG,master,path],{stdio:'inherit'});
  if(encoded.status!==0)throw Error(`${name}: encoding the JPEG needs python3 with Pillow`);
  console.log(`Wrote ${path} (1200x630)`);
 }
 writeFileSync(resolve(evidence,'audit.json'),JSON.stringify(reports,null,2));
}finally{await browser.close()}
