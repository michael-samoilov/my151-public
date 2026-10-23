import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inputHashes, WIDTHS} from './manifest.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || !process.argv[i + 1]) throw Error('Expected --name value arguments');
  args.set(process.argv[i].slice(2), process.argv[i + 1]);
}
const required = key => { if (!args.has(key)) throw Error('Missing --' + key); return args.get(key); };
const root = fs.realpathSync(required('root'));
const dist = fs.realpathSync(path.resolve(root, args.get('dist') || 'dist'));
const out = path.resolve(required('out'));
const assets = path.resolve(args.get('assets-dir') || path.join(out, 'assets'));
const helper = path.resolve(args.get('encoder') || path.join(path.dirname(fileURLToPath(import.meta.url)), 'encode.py'));
const widths = (args.get('widths') || WIDTHS.join(',')).split(',').map(Number);
const dpr = 3, height = Number(args.get('height') || 852);
if (widths.some(w => !Number.isInteger(w) || w < 320 || w >= 1024) || !Number.isInteger(height) || height < 600) throw Error('Invalid mobile capture dimensions');
if (fs.existsSync(out)) throw Error('Use a unique --out directory; completed evidence must not be overwritten');
fs.mkdirSync(out, {recursive: true});
fs.mkdirSync(assets, {recursive: true});
const require = createRequire(path.join(root, 'package.json'));
const {chromium} = require('playwright');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const hashes = () => inputHashes(root);
const sourceInputs = hashes();
const ownInputs = {generator: sha(fs.readFileSync(fileURLToPath(import.meta.url))), encoder: sha(fs.readFileSync(helper))};
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const dirty = execFileSync('git', ['status', '--short'], {cwd: root, encoding: 'utf8'});
const manifest = {lockfileSha256:sha(fs.readFileSync(path.join(root,'package-lock.json'))),version:1,baseCommit:commit,inputs:sourceInputs,poses:[],trimUnits:'device pixels', sourceRoot: root, sourceCommit: commit, sourceDirty: dirty, sourceInputs, toolInputs: ownInputs, distIndexSha256: sha(fs.readFileSync(path.join(dist, 'index.html'))), capture: {widths, height, dpr, locale: 'en-US', isMobile: true, hasTouch: true, phase: 'actual settled original artwork', assetsDirectory: assets}, startedAt: new Date().toISOString(), pid: process.pid, stage: 'prepared', cases: [], status: 'running'};
const write = () => fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
write();
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.avif':'image/avif', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.ico':'image/x-icon'};
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (file !== dist && !file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && !path.extname(url.pathname) && request.headers.accept?.includes('text/html')) file = path.join(dist, 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
const captureCss = 'html,body,#root,.bg-background,[data-card-panel]{background:transparent!important}body *{visibility:hidden!important}[data-bake-artwork],[data-bake-artwork] *{visibility:visible!important}[data-card-pocket],[data-card-caption]{visibility:hidden!important}';
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({executablePath: args.get('chromium') || process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage']});
  manifest.browserVersion = browser.version();
  manifest.capture.css = captureCss;
  for (const width of widths) {
    manifest.stage=width+'/load';write();
    const pose={viewportWidth:width,dpr,cards:[]};manifest.poses.push(pose);
    const context = await browser.newContext({viewport:{width,height}, deviceScaleFactor:dpr, isMobile:true, hasTouch:true, locale:'en-US', serviceWorkers:'block'});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    try {
      const response = await page.goto(origin + (args.get('page') || '/?notme'), {waitUntil:'domcontentloaded', timeout:30000});
      if (!response?.ok()) throw Error('Homepage HTTP ' + response?.status());
      await page.waitForFunction(() => {const imgs=[...document.querySelectorAll('[data-artwork] img[alt]:not([alt=""])')];return imgs.length===6&&imgs.every(i=>i.complete&&i.naturalWidth===800)&&!document.documentElement.classList.contains('p151-hub-images-pending')&&!document.documentElement.classList.contains('p151-hub-font-pending');}, null, {timeout:20000});
      await page.evaluate(async () => {await document.fonts.ready; await Promise.all([...document.querySelectorAll('[data-artwork] img')].map(i=>i.decode()));});
      await page.mouse.move(0,0);
      await page.waitForTimeout(350);
      for (const key of ['favorites','dex','league']) {
        manifest.stage = width + '/' + key; write();
        const result = {key, viewport:{width,height}, dpr, status:'running', errors};
        try {
          await page.evaluate(key => {
            document.querySelector('#bake-visibility')?.remove();
            for (const node of document.querySelectorAll('[data-bake-artwork]')) node.removeAttribute('data-bake-artwork');
            const card=document.querySelector('[data-hub-card="'+key+'"]');
            if (!card) throw Error('Missing source card '+key);
            const panel=card.querySelector('[data-card-panel]'), r=panel.getBoundingClientRect();
            scrollTo(0,Math.max(0,scrollY+r.bottom-(innerHeight-64)));
            card.querySelector('[data-artwork]').setAttribute('data-bake-artwork','');
          }, key);
          await page.evaluate(() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const geometry = await page.evaluate(({key,dpr}) => {
            const card=document.querySelector('[data-hub-card="'+key+'"]'),panel=card.querySelector('[data-card-panel]'),r=panel.getBoundingClientRect();
            const floor=n=>Math.floor(n*dpr)/dpr,ceil=n=>Math.ceil(n*dpr)/dpr;
            const left=Math.max(0,floor(r.left-96)),right=Math.min(innerWidth,ceil(r.right+96));
            const top=Math.max(0,floor(r.top-r.width*1.4-96)),bottom=Math.min(innerHeight,ceil(r.bottom+48));
            if(right<=left||bottom<=top||r.top<0||r.bottom>innerHeight)throw Error('Panel does not fit capture viewport');
            const stage=card.querySelector('.hub-stage'), rect=node=>{const a=node.getBoundingClientRect();return{x:a.x,y:a.y,width:a.width,height:a.height};};
            if(document.getAnimations().some(a=>a.playState==='running'))throw Error('Animation still running at bake');
            if(stage&&parseFloat(getComputedStyle(stage).getPropertyValue('--hover-lift'))>0)throw Error('Hovered source pose');
            return{panel:rect(panel),card:rect(card),stage:rect(stage),scroll:{x:scrollX,y:scrollY},capture:{x:left+scrollX,y:top+scrollY,width:right-left,height:bottom-top},captureViewport:{x:left,y:top,width:right-left,height:bottom-top},rootFontSize:getComputedStyle(document.documentElement).fontSize,images:[...card.querySelectorAll('[data-artwork] img')].map(i=>({src:i.currentSrc,width:i.naturalWidth,height:i.naturalHeight})),ink:[...card.querySelectorAll('.hub-stage > span:nth-child(2) [data-shot]')].map(rect)};
          }, {key,dpr});
          const style = await page.addStyleTag({content:captureCss});
          await style.evaluate(node=>node.id='bake-visibility');
          const png = path.join(out, 'capture-'+key+'-'+width+'-3x.png');
          await page.screenshot({path:png, clip:geometry.capture, omitBackground:true, animations:'allow', scale:'device'});
          const encoded = JSON.parse(execFileSync(args.get('python') || 'python', [helper,'--input',png,'--assets-dir',assets,'--key',key,'--width',String(width),'--dpr',String(dpr)], {encoding:'utf8',maxBuffer:1024*1024}));
          const [left,top,right,bottom]=encoded.alphaCropPixels;
          const panelRelative={x:geometry.captureViewport.x+left/dpr-geometry.panel.x,y:geometry.captureViewport.y+top/dpr-geometry.panel.y,width:(right-left)/dpr,height:(bottom-top)/dpr};
          const asset=format=>({file:path.relative(out,encoded.formats[format].path).split(path.sep).join('/'),bytes:encoded.formats[format].bytes,sha256:encoded.formats[format].sha256});
          const card={key,panel:geometry.panel,capture:geometry.captureViewport,trim:{left,top,width:right-left,height:bottom-top},placement:{left:panelRelative.x,top:panelRelative.y,width:panelRelative.width,height:panelRelative.height},avif:asset('avif'),webp:asset('webp')};
          if(Math.abs(encoded.outputPixelSize[0]-card.placement.width*dpr)>1e-6||Math.abs(encoded.outputPixelSize[1]-card.placement.height*dpr)>1e-6)throw Error('Placement does not preserve native output dimensions');
          pose.cards.push(card);
          Object.assign(result,{geometry,captureFile:png,encoded,panelRelative,status:'PASS'});
          if(errors.length)throw Error('Source JS errors: '+errors.join('; '));
        } catch(error) {result.status='FAIL';result.error=String(error);throw error;}
        finally {manifest.cases.push(result);fs.writeFileSync(path.join(out,key+'-'+width+'-status.json'),JSON.stringify(result,null,2)+'\n');write();console.log(result.status+' '+width+'/'+key);}
      }
    } finally {await context.close();}
  }
  if(JSON.stringify(hashes())!==JSON.stringify(sourceInputs))throw Error('Source inputs changed during generation');
  if(sha(fs.readFileSync(fileURLToPath(import.meta.url)))!==ownInputs.generator||sha(fs.readFileSync(helper))!==ownInputs.encoder)throw Error('Generator inputs changed during generation');
  manifest.pillowVersions=[...new Set(manifest.cases.map(c=>c.encoded.pillowVersion))];
  manifest.status='PASS';
} catch(error) {manifest.status='FAIL';manifest.error=String(error);process.exitCode=1;console.error(error);}
finally {await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));manifest.stage='complete';manifest.finishedAt=new Date().toISOString();write();console.log('MANIFEST '+path.join(out,'manifest.json'));}
