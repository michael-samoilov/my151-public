import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const output = path.resolve(process.argv[2] || '.audit/security-review/browser');
await mkdir(output, { recursive: true });
const payload = '<img src=x onerror=alert(1)>';
const records = [];
let apiReads = 0;
const harness = `<!doctype html><html><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {FeedbackCard} from '/src/components/admin/FeedbackCard.tsx';
window.renderFeedback = token => createRoot(document.getElementById('root')).render(React.createElement(FeedbackCard, {token}));
window.renderFeedback('fixture-admin');
</script></body></html>`;
const server = await createServer({ server: { host: '127.0.0.1', port: 4387, strictPort: true }, logLevel: 'silent', envFile: false, plugins: [{
  name: 'local-security-fixtures', configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url, 'http://127.0.0.1:4387');
    if (url.pathname === '/__security') { res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url,harness)); return; }
    if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/_')) {
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/feedback-list') {
        apiReads++;
        if (req.headers.authorization !== 'Bearer fixture-admin') { res.statusCode = 401; res.end('{"error":"Unauthorized fixture"}'); return; }
        res.end(JSON.stringify({items:[{id:'fixture-report',ts:1792108800000,category:payload,message:payload,country:payload,context:{route:payload,locale:payload,error:{message:payload}}}], total:1,last7:{other:1},last30:{other:1}})); return;
      }
      res.end('{"ok":true}'); return;
    }
    next();
  }); }
}] });
let browser;
try {
  await server.listen();
  const origin = 'http://127.0.0.1:4387';
  browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH || "/usr/bin/chromium",args:["--no-sandbox"]});
  let blockedExternal = 0;
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) { blockedExternal++; return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", e=>console.error(e.message));
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await page.goto(`${origin}/__security`);
  await page.getByText(payload,{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'context',exact:true}).click();
  await page.waitForTimeout(250);
  const injectedNodes = await page.locator('#root img[src="x"]').count();
  assert.equal(injectedNodes,0); assert.equal(dialogs,0);
  await page.screenshot({path:path.join(output,'feedback-xss.png'),fullPage:true});
  records.push({attack:'Stored feedback XSS',scope:'Actual FeedbackCard with local fake API, no persistence',request:{path:'/api/feedback-list?limit=200',authorization:'Bearer [FIXTURE]',payload},response:{status:200,literalText:true,injectedNodes,dialogs},result:'refused (escaped as text)'});
  await page.evaluate(p => { const d=document.createElement('div'); d.id='positive-control'; d.innerHTML=p; document.body.append(d); },payload);
  await page.waitForTimeout(250); assert.equal(dialogs,1);
  await page.locator('#positive-control').evaluate(el=>el.remove());
  records.push({attack:'XSS positive control',scope:'Disposable harness DOM only; app protection unchanged',response:{dialogs:1},result:'payload executed in unescaped harness'});
  for (const value of ['https://outside.invalid','//outside.invalid','@outside.invalid']) {
    await page.goto(`${origin}/?notme&next=${encodeURIComponent(value)}`);
    await page.waitForTimeout(350);
    assert.equal(new URL(page.url()).origin,origin);
    records.push({attack:'Open redirect',request:{path:`/?notme&next=${encodeURIComponent(value)}`},response:{origin:new URL(page.url()).origin},result:'stayed on local app; no sign-in redirect feature'});
  }
  await page.goto(`${origin}/custom-gym-leader?notme`);
  await page.evaluate(async p => { const {useLeagueStore}=await import('/src/league/store/useLeagueStore.ts');useLeagueStore.getState().setName(p);useLeagueStore.getState().setBadgeName(0,p); },payload);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('img[src="x"]').count(),0);
  assert.equal(dialogs,1);
  const localName = await page.evaluate(()=>JSON.parse(localStorage.getItem('league-builder')).state.name);
  assert.equal(localName,payload);
  await page.screenshot({path:path.join(output,'league-xss.png'),fullPage:true});
  await page.getByTestId('league-slot-0').click();
  await page.getByTestId('slot-badge').waitFor();
  const badgeText = await page.getByTestId('slot-badge').textContent();
  assert.ok(badgeText.includes('<img'));
  assert.equal(await page.locator('img[src="x"]').count(),0);
  assert.equal(dialogs,1);
  await page.screenshot({path:path.join(output,'badge-xss.png'),fullPage:true});
  records.push({attack:'Local saved league name and badge XSS',request:{fixture:'setName/setBadgeName through actual store',payload},response:{savedName:localName,badgeRenderedText:badgeText,injectedNodes:0,additionalDialogs:0},result:'no execution; browser-local test data only'});
  await page.goto(`${origin}/__security`);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.reload();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const countBefore=apiReads;
  const reads=await page.evaluate(async()=>{
    const a=await fetch('/api/feedback-list?limit=200',{headers:{Authorization:'Bearer fixture-admin'}});
    const b=await fetch('/api/feedback-list?limit=200');
    const entries=await Promise.all((await caches.keys()).map(async n=>({name:n,urls:(await(await caches.open(n)).keys()).map(r=>new URL(r.url).pathname)})));
    return {a:a.status,b:b.status,bBody:await b.json(),entries};
  });
  assert.equal(reads.a,200);assert.equal(reads.b,401);
  assert.equal(reads.entries.flatMap(e=>e.urls).some(u=>u.startsWith('/api/')),false);
  records.push({attack:'Service worker API cross-auth reuse',request:{path:'/api/feedback-list?limit=200',sequence:['fixture admin','logged out']},response:{...reads,apiReadCount:apiReads-countBefore},result:'API excluded from service worker cache; mocked API enforces auth'});
  const other=await browser.newContext();
  await other.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const b=await other.newPage();await b.goto(`${origin}/?notme`);
  const stateB=await b.evaluate(()=>({league:localStorage.getItem('league-builder'),admin:localStorage.getItem('p151-admin-token')}));
  assert.equal(stateB.league,null);assert.equal(stateB.admin,null);
  records.push({attack:'Browser A to B local storage isolation',response:stateB,result:'independent contexts have no A saved league/admin token; no CDN cache claim'});
  await other.close();
  await context.close();
  await writeFile(path.join(output,'results.json'),JSON.stringify({sourceCommit:'40aceaf9',engine:'Playwright Chromium',network:'Local origin only; all external browser requests aborted; API routes are fixtures',blockedExternal,records},null,2)+'\n');
  console.log(JSON.stringify({output,checks:records.length,blockedExternal,result:'pass'}));
} finally { await browser?.close(); await server.close(); }
