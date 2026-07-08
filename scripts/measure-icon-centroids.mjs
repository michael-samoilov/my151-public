// Icon optical-centering harness for MilestoneBar. Rasterizes each glyph,
// computes the alpha-weighted ink centroid, and prints the offset (fraction of
// icon size) that moves the centroid to the circle center. Paste the output
// into OPTICAL_OFFSET in src/components/pokedex/MilestoneBar.tsx. Also writes
// icon-<name>.png verification images (red dot = centroid, blue cross =
// center). Run against the dev server: `node scripts/measure-icon-centroids.mjs`.

import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const stages = JSON.parse(execSync('node /home/user/my151/scripts/intro-stages.mjs').toString());
const full = stages[2].sections;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function boot(sections, mm){
  const ctx = await browser.newContext({ viewport:{width:1200,height:300}, deviceScaleFactor:2 });
  await ctx.addInitScript(({sec,mm})=>{
    localStorage.setItem('personal-151-pokedex-demo', JSON.stringify({ state:{ sections:sec, milestoneMax:mm, milestoneCelebrated:[25,50,100,151], viewShowSections:false, viewSortOption:'build-order', viewGroupSpecialAtEnd:true, viewCustomOrder:null, whatsAdvisorExpanded:true }, version:9 }));
    localStorage.setItem('p151-intro-seen','1');
  }, {sec:sections, mm});
  const p = await ctx.newPage();
  await p.goto('http://localhost:5199/?demo=151', { waitUntil:'networkidle' });
  await p.waitForTimeout(1000);
  return { ctx, p };
}

async function measure(p, labelPrefix){
  const svgHTML = await p.evaluate((pref)=>{
    const btn = document.querySelector(`button[aria-label^="${pref}"]`);
    return btn ? btn.querySelector('svg').outerHTML : null;
  }, labelPrefix);
  if(!svgHTML) return null;
  return await p.evaluate((html)=>{
    return new Promise((res)=>{
      const S = 300;
      // Only rewrite the ROOT <svg ...> tag (preserve child rect width/height).
      const svg = html.replace(/<svg([^>]*)>/, (m, attrs)=>{
        const cleaned = attrs.replace(/\s(width|height|style|class)="[^"]*"/g, '');
        return `<svg${cleaned} width="${S}" height="${S}" style="color:#000">`;
      });
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width=S; c.height=S;
        const ctx = c.getContext('2d'); ctx.clearRect(0,0,S,S); ctx.drawImage(img,0,0,S,S);
        const d = ctx.getImageData(0,0,S,S).data;
        let mx=0,my=0,m=0;
        for(let y=0;y<S;y++) for(let x=0;x<S;x++){ const a=d[(y*S+x)*4+3]; if(a>8){ mx+=x*a; my+=y*a; m+=a; } }
        const cx=mx/m, cy=my/m;
        // verification overlay: blue cross = geometric center, red dot = centroid
        ctx.strokeStyle='#2563eb'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(S/2-12,S/2); ctx.lineTo(S/2+12,S/2); ctx.moveTo(S/2,S/2-12); ctx.lineTo(S/2,S/2+12); ctx.stroke();
        ctx.fillStyle='#dc2626'; ctx.beginPath(); ctx.arc(cx,cy,5,0,7); ctx.fill();
        res({ dx:+((S/2-cx)/S).toFixed(4), dy:+((S/2-cy)/S).toFixed(4), cx:+cx.toFixed(1), cy:+cy.toFixed(1), png: c.toDataURL('image/png') });
      };
      img.onerror = () => res(null);
      img.src = url;
    });
  }, svgHTML);
}

const results = {};
let b = await boot(full, 151);
for (const [name,pref] of [['analytics','25:'],['view','50:'],['stats','100:'],['complete','151:']]) results[name] = await measure(b.p, pref);
await b.ctx.close();
b = await boot({}, 0);
results['lock'] = await measure(b.p, '25:');
await b.ctx.close();
await browser.close();

const offsets = {};
for (const [name,r] of Object.entries(results)){
  if(!r){ console.log(name, 'NULL'); continue; }
  offsets[name] = { dx:r.dx, dy:r.dy };
  fs.writeFileSync(`icon-${name}.png`, Buffer.from(r.png.split(',')[1],'base64'));
}
console.log(JSON.stringify(offsets, null, 2));
