

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import { build, type Plugin, type ResolvedConfig } from 'vite';
import { copyHomeArtwork } from './home-artwork/manifest.mjs';
import type { ArtworkPose } from '../src/home/artwork-types';

const ENTRY = 'src/home/prerender.ts';
const STORE_KEY = 'personal-151-pokedex-v3';

function initialInter(root: string, markup: string): string {
  const directory = path.join(root, 'src/assets/fonts');
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'inter-home-initial.json'), 'utf8')) as {
    sha256: string; sourceSha256: string; codepoints: number[];
  };
  const font = fs.readFileSync(path.join(directory, 'inter-home-initial.woff2'));
  const source = fs.readFileSync(path.join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'));
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  if (hash(font) !== metadata.sha256 || hash(source) !== metadata.sourceSha256) {
    throw new Error('prerender-hub: regenerate the initial Inter font after a font change');
  }
  const text = markup.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, entity => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'",
  })[entity] ?? entity);
  const supported = new Set(metadata.codepoints);
  const missing = [...new Set(Array.from(text).map(character => character.codePointAt(0)!))]
    .filter(codepoint => codepoint >= 32 && !supported.has(codepoint));
  if (missing.length) throw new Error(`prerender-hub: initial Inter lacks ${missing.map(value => `U+${value.toString(16)}`).join(', ')}`);
  const range = metadata.codepoints.map(value => `U+${value.toString(16)}`).join(',');
  return `<style>@font-face{font-family:'P151 Inter Initial';font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2-variations');unicode-range:${range}}html.p151-hub-inter-initial body{font-family:'P151 Inter Initial','Inter Variable','Inter Fallback',system-ui,-apple-system,sans-serif}html.p151-hub-font-pending #root{visibility:hidden}</style>
<script>(function(){var d=document.documentElement;d.classList.add('p151-hub-inter-initial','p151-hub-font-pending');Promise.all([400,700,800].map(function(w){return document.fonts.load(w+' 16px "P151 Inter Initial"','my151.app Pokédex 0123456789').then(function(f){if(!f.length||f.some(function(x){return x.status!=='loaded'}))throw Error('Initial Inter is unavailable')})})).then(function(){d.classList.remove('p151-hub-font-pending')},function(){d.classList.add('p151-hub-font-failed')})})();</script>`;
}

interface BootInputs {
  HOME_ARTWORK: ArtworkPose[];
  HOME_MOBILE_MEDIA: string;
  LOCALES: readonly string[];
  SLOT_COUNT: number;
  SAVED_PICKS_KEY: string;
  POKEDEX_PERSIST_VERSION: number;
  FAVORITES_NOTICE_START: number;
  FAVORITES_NOTICE_END: number;
  FAVORITES_NOTICE_SEEN_KEY: string;
  RETURNING_KEYS: readonly string[];
}

// The root font-size before the app mounts: the same layout-viewport width and formula as `src/lib/layoutFontSize.ts`.
// platform: Reading visualViewport.width forces layout and Firefox paints once layout starts, so this runs after the inline stylesheet.
const FONT_SIZE_SCRIPT =
  "(function(){var v=window.visualViewport,w=v?Math.round(v.width*v.scale):innerWidth;document.documentElement.style.fontSize=Math.max(16,Math.min(13+0.007*w,20))+'px'})()";

/**
 * Writes the boot script's saved counts into the prerendered progress lines.
 * It runs where the parser meets it, before the end marker lets the hub paint,
 * so the first paint already shows them. HomePage hydrates from the same
 * counts. A null count is one the app may correct, so its line waits for the app.
 */
const COUNTS_SCRIPT =
  "(function(){var c=window.p151HubCounts;if(c)for(var k in c){var p=document.querySelector('[data-card-progress=\"'+k+'\"]'),n=p&&p.querySelector('[data-progress-count] .text-primary');if(!n||c[k]==null)continue;n.textContent=String(c[k]);if(c[k]>0)p.removeAttribute('data-empty')}})()";

export function splitImagePreloads(markup: string): { preloads: string[]; markup: string } {
  // platform: Explicit React preloads put href before as; automatic preloads do not.
  const imagePreload = /<link\b(?=[^>]*\srel="preload")(?=[^>]*\sas="image")[^>]*\/>/g;
  return { preloads: markup.match(imagePreload) ?? [], markup: markup.replace(imagePreload, '') };
}

function prioritizeHubImages(html: string): string {
  const entry = /<script type="module" crossorigin src="([^"]+)"><\/script>/;
  const preloads = /\s*<link rel="modulepreload" crossorigin href="([^"]+)">/g;
  const src = entry.exec(html)?.[1];
  if (!src) throw new Error('prerender-hub: the client entry is missing');
  const files = JSON.stringify([src, ...[...html.matchAll(preloads)].map(match => match[1])]);
  const startup = `(function(){
var d=document.documentElement,started=false,preloaded=false,observer;
function preload(){if(preloaded)return;preloaded=true;${files}.forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l)})}
function loaded(){var imgs=Array.from(document.querySelectorAll(d.dataset.homeScene==='mobile'?'[data-card-scene][data-scene-slot="'+d.dataset.homeSlot+'"]':'[data-artwork] img[alt]:not([alt=""])'));if(imgs.length&&imgs.every(function(i){return i.complete&&i.naturalWidth&&i.currentSrc&&!i.currentSrc.startsWith('data:')}))preload()}
function intent(e){var t=e.target;if(e.type==='keydown'||t&&t.closest&&t.closest('button'))start()}
function error(e){if(e.target instanceof HTMLImageElement)start()}
function start(){
if(started)return;started=true;if(observer)observer.disconnect();
document.removeEventListener('load',loaded,true);document.removeEventListener('error',error,true);
['pointerdown','click','keydown'].forEach(function(t){window.removeEventListener(t,intent,true)});
preload();
function run(){var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=${JSON.stringify(src)};document.head.appendChild(s)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run()
}
function painted(){if(!d.classList.contains('p151-hub-images-pending'))requestAnimationFrame(function(){setTimeout(start)})}
if(d.classList.contains('p151-wait')||document.visibilityState!=='visible'){start();return}
observer=new MutationObserver(painted);observer.observe(d,{attributes:true,attributeFilter:['class']});
document.addEventListener('load',loaded,true);document.addEventListener('error',error,true);
['pointerdown','click','keydown'].forEach(function(t){window.addEventListener(t,intent,true)});
loaded();painted()
})();`;
  return html.replace(entry, () => `<script>${startup}</script>`).replace(preloads, '');
}

function bootScript(input: BootInputs): string {
  const j = JSON.stringify;
  // `?trace` loads the hub load timeline, public/trace.js. It blocks the
  // parser on purpose, so its observers exist before the body parses.
  return `(function(){
if(new URLSearchParams(location.search).has('trace'))document.write('<script src="/trace.js"><\\/script>');
var d=document.documentElement;
d.classList.add('p151-hub-images-pending');
var earlyButton=null;
function earlyClick(e){var root=document.getElementById('root'),t=e.target,b=t&&t.closest&&t.closest('button');if(!root||!b||!root.contains(b)||d.classList.contains('p151-wait'))return;e.preventDefault();e.stopImmediatePropagation();earlyButton=b}
function G(k){try{return localStorage.getItem(k)}catch(e){return null}}
function J(k){try{return JSON.parse(G(k)||'null')}catch(e){return null}}
function S(k){var s=J(k);return s&&s.state||null}
function some(o,f){for(var k in o)if(f(o[k]))return true;return false}
var L=${j(input.LOCALES)},q=new URLSearchParams(location.search),loc=q.get('lang'),dexSave=J(${j(STORE_KEY)}),dex=dexSave&&dexSave.state||null,lg=S('league-builder'),fv=S('favorite-picker');
function m(t){t=String(t).toLowerCase();var p=t.split('-')[0],i;if(p==='zh')return'zh';
for(i=0;i<L.length;i++)if(L[i].toLowerCase()===t)return L[i];
for(i=0;i<L.length;i++)if(L[i].toLowerCase().split('-')[0]===p)return L[i];return null}
if(L.indexOf(loc)<0)loc=null;
if(!loc)loc=dex&&dex.locale||null;
if(!loc){var n=navigator.languages||[navigator.language];for(var i=0;i<n.length&&!loc;i++)loc=m(n[i])}
var saved={dex:!!dex&&some(dex.sections,function(x){return Array.isArray(x)&&x.length>0}),
league:!!lg&&Array.isArray(lg.cards)&&some(lg.cards.slice(0,${input.SLOT_COUNT}),function(c){return!!c&&Array.isArray(c.lines)&&c.lines.length>0}),
favorites:!!fv&&some(fv.fills,function(x){return typeof x==='number'})},any=false;
for(var t in saved)if(saved[t]){any=true;d.classList.add('p151-saved-'+t)}
function sum(o,f){var c=0;for(var k in o)c+=f(o[k]);return c}
var picks=J(${j(input.SAVED_PICKS_KEY)});
window.p151HubCounts={dex:!dex?0:dexSave.version===${input.POKEDEX_PERSIST_VERSION}?sum(dex.sections,function(x){return Array.isArray(x)?x.length:0}):null,
league:lg&&Array.isArray(lg.cards)?sum(lg.cards.slice(0,${input.SLOT_COUNT}),function(c){return c&&Array.isArray(c.lines)&&c.lines.length>0?1:0}):0,
favorites:!saved.favorites?0:picks&&picks.saved===G('favorite-picker')&&typeof picks.filled==='number'?picks.filled:null};
var now=Date.now(),notice=now>=${input.FAVORITES_NOTICE_START}&&now<${input.FAVORITES_NOTICE_END}&&G(${j(input.FAVORITES_NOTICE_SEEN_KEY)})!=='1'&&(any||${j(input.RETURNING_KEYS)}.some(function(k){return G(k)!==null}));
if((loc||'en')!=='en'||notice||q.has('admin')||q.has('demo'))d.classList.add('p151-wait');
if(!d.classList.contains('p151-wait')){
document.addEventListener('click',earlyClick,true);
document.addEventListener('p151-hub-interactive',function(){document.removeEventListener('click',earlyClick,true);var b=earlyButton;earlyButton=null;if(b&&b.isConnected)b.click()},{once:true})}
})();`;
}

export function prerenderHub(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'prerender-hub',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      if (config.build.ssr) return;
      const outDir = path.resolve(config.root, config.build.outDir);
      const htmlFile = path.join(outDir, 'index.html');
      if (!fs.existsSync(htmlFile)) return;
      if (process.env.MY151_HOME_ARTWORK_CAPTURE !== '1') copyHomeArtwork(config.root, outDir);
      // platform: Node resolves react from node_modules only when the server bundle sits inside the project.
      const ssrDir = path.join(config.root, 'node_modules/.cache/my151-prerender', path.basename(outDir));
      try {
        await build({
          configFile: false,
          root: config.root,
          mode: config.mode,
          logLevel: 'warn',
          plugins: [react()],
          resolve: { alias: config.resolve.alias },
          define: config.define,
          build: {
            ssr: path.join(config.root, ENTRY),
            outDir: ssrDir,
            emptyOutDir: true,
            copyPublicDir: false,
            minify: false,
            rollupOptions: { output: { entryFileNames: 'prerender.mjs' } },
          },
        });
        const entry = pathToFileURL(path.join(ssrDir, 'prerender.mjs')).href;
        const { renderHub, ...inputs } = (await import(`${entry}?t=${Date.now()}`)) as BootInputs & {
          renderHub: () => string;
        };
        const markup = renderHub();
        const font = fs.readdirSync(path.join(outDir, 'assets')).find((f) => /^inter-latin-wght-normal-.*\.woff2$/.test(f));
        if (!font) throw new Error('prerender-hub: the Inter font file is missing from the build');
        let html = fs.readFileSync(htmlFile, 'utf8');
        const root = '<div id="root"></div>';
        if (!html.includes(root)) throw new Error(`prerender-hub: index.html has no empty ${root}`);
        // platform: Only Chromium holds the first paint for `blocking="render"` until the end marker, so a `:has()` rule hides the hub elsewhere.
        // platform: React puts the screenshot preloads at the start of the markup, so they move to the head ahead of the styles.
        const { preloads, markup: body } = splitImagePreloads(markup);
        const poses = inputs.HOME_ARTWORK;
        const imagePreloads = preloads.map(tag => poses.length && !tag.includes(' media=')
          ? tag.replace(/\/?>$/, ` media="not all and ${inputs.HOME_MOBILE_MEDIA}"/>`) : tag);
        poses.forEach((pose, index) => {
          const lo = index ? (poses[index - 1].viewportWidth + pose.viewportWidth) / 2 + 0.001 : 0;
          const hi = index === poses.length - 1 ? 480 : (pose.viewportWidth + poses[index + 1].viewportWidth) / 2;
          const media = `${inputs.HOME_MOBILE_MEDIA} and (min-width:${lo}px) and (max-width:${hi}px)`;
          pose.cards.forEach(card => imagePreloads.push(`<link rel="preload" as="image" type="image/avif" fetchpriority="high" media="${media}" href="/assets/home-mobile/${card.avif.file}">`));
        });
        html = html.replace(root, () => `<div id="root" data-prerendered>${body}</div><script>${COUNTS_SCRIPT}</script><span id="p151-end" hidden></span>`);
        const viewport = /<meta name="viewport"[^>]*>/;
        if (!viewport.test(html)) throw new Error('prerender-hub: index.html has no viewport meta tag');
        html = html.replace(viewport, (tag) => [tag, ...imagePreloads].join('\n    '));
        const head = [
          initialInter(config.root, markup),
          '<link rel="expect" href="#p151-end" blocking="render">',

          '<style>html .p151-boot{display:none}html.p151-wait .p151-boot{display:flex}html.p151-hub-images-pending:has(.hub-grid) .p151-boot{display:flex}html.p151-hub-images-pending .p151-boot{pointer-events:none}html.p151-hub-font-pending .p151-boot{visibility:hidden}html.p151-wait #root{display:none}</style>',
          '<style>html:not(:has(#p151-end)) #root{visibility:hidden}html.p151-hub-images-pending .hub-grid{visibility:hidden}html.p151-hub-images-pending .hub-home:has(.hub-grid),html.p151-hub-images-pending #root:has(.hub-grid) div:has(>footer){visibility:hidden}'+['dex','league','favorites'].map(k=>`html.p151-hub-${k}-fallback .hub-card[data-hub-card="${k}"] [data-card-panel]{visibility:hidden}`).join('')+'</style>',
          '<style>[data-card-scene]{display:none;position:absolute;pointer-events:none;max-width:none}html[data-home-scene="mobile"] [data-artwork]{display:none!important}html[data-home-scene="mobile"][data-home-slot="0"] [data-card-scene][data-scene-slot="0"],html[data-home-scene="mobile"][data-home-slot="1"] [data-card-scene][data-scene-slot="1"]{display:block}'+['dex','league','favorites'].map(key=>`[data-card-scene="${key}"]{left:var(--scene-${key}-left);top:var(--scene-${key}-top);width:var(--scene-${key}-width);height:var(--scene-${key}-height)}`).join('')+'</style>',
          `<script>${bootScript(inputs)}</script>`,
        ].join('\n    ');
        // platform: An inline script after a stylesheet waits for it, and link previews read only about the first 32 KB.
        const firstStyle = html.indexOf('<style');
        if (firstStyle === -1 || firstStyle > html.indexOf('</head>')) throw new Error('prerender-hub: index.html has no <style> in its head');
        html = `${html.slice(0, firstStyle)}${head}\n    ${html.slice(firstStyle)}`;

        const sheets = [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+\.css)">/g)];
        if (sheets.length === 0) throw new Error('prerender-hub: index.html links no stylesheet');
        for (const [tag, href] of sheets) {
          const css = fs.readFileSync(path.join(outDir, href.slice(config.base.length)), 'utf8');
          if (css.includes('</style')) throw new Error(`prerender-hub: ${href} cannot be inlined`);
          html = html.replace(tag, () => `<style>${css}</style>`);
          const prefetch = `addEventListener('load',function(){var l=document.createElement('link');l.rel='prefetch';l.href=${JSON.stringify(href)};document.head.appendChild(l)})`;
          html = html.replace('</body>', () => `<script>${prefetch}</script>\n  </body>`);
        }

        const controller = fs.readFileSync(path.join(config.root, 'src/home/artwork-controller.js'), 'utf8')
          .replace('export function installHomeArtwork', 'function installHomeArtwork');
        const ready = `(${controller})(${JSON.stringify(inputs.HOME_ARTWORK)})`;
        html = html.replace('</body>', () => `<script>${ready}</script>\n  </body>`);
        html = prioritizeHubImages(html);
        const lastSheet = html.lastIndexOf('</style>');
        const after = lastSheet + '</style>'.length;
        html = `${html.slice(0, after)}\n    <script>${FONT_SIZE_SCRIPT}</script>${html.slice(after)}`;
        fs.writeFileSync(htmlFile, html);
      } finally {
        fs.rmSync(ssrDir, { recursive: true, force: true });
      }
    },
  };
}
