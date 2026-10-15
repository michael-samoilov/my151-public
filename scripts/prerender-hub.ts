/**
 * Prerenders the hub (`/`) into dist/index.html after the client build.
 *
 * Without it the hub's HTML holds only a spinner, and the page appears after
 * about 250 KiB of JavaScript. With it, the hub paints as soon as the HTML
 * arrives, and the client hydrates the same markup.
 *
 * The plugin builds `src/home/prerender.ts` for Node with the client build's
 * aliases and defines, so asset URLs and the footer's build version match the
 * client. It then writes four things into dist/index.html:
 *
 * - The markup, in `#root`, marked `data-prerendered`.
 * - The stylesheet, inline. The tool pages still link it.
 * - A head script that runs before the first paint. It sets the root font
 *   size with the formula in src/lib/layoutFontSize.ts, so nothing shifts when
 *   that module runs. It adds `p151-saved-<tool>` to <html> for each tool with
 *   saved work in this browser, which hides the count on that card's "saved
 *   in this browser" line until the app reads it, so it never shows 0 first
 *   (src/index.css). It adds
 *   `p151-wait` when the visitor will not get this exact page: another
 *   language, `?admin`, `?demo`, or a returning visitor while the Tools menu's
 *   favorites notice runs. Those visitors see the spinner until the app
 *   renders, as before.
 * - A preload for the Inter font. The fallback in src/index.css keeps the
 *   layout when Inter arrives; the preload makes it arrive with the first
 *   paint more often, and Lighthouse counts the font in the first paint.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import react from '@vitejs/plugin-react';
import { build, type Plugin, type ResolvedConfig } from 'vite';

const ENTRY = 'src/home/prerender.ts';
// Saved Pokédex key; its `state.locale` is the language the visitor chose.
const STORE_KEY = 'personal-151-pokedex-v3';

/** What the server entry exports for the head script. */
interface BootInputs {
  LOCALES: readonly string[];
  SLOT_COUNT: number;
  FAVORITES_NOTICE_START: number;
  FAVORITES_NOTICE_END: number;
  FAVORITES_NOTICE_SEEN_KEY: string;
  RETURNING_KEYS: readonly string[];
}

/**
 * The head script. Its language choice mirrors `resolveActiveLocale` in
 * src/i18n/bootstrap.ts. Its saved-work tests mirror the hub's counts in
 * HomePage.tsx, and its notice test mirrors the Tools menu's launch notice.
 */
/**
 * The root font-size before the app mounts: the same layout-viewport width and
 * formula as `src/lib/layoutFontSize.ts`. It runs right after the inline
 * stylesheet. Reading `visualViewport.width` forces layout, and Firefox paints
 * a page as soon as its layout starts: read before the stylesheet, it showed
 * the hub unstyled for about 600 ms on every load.
 */
const FONT_SIZE_SCRIPT =
  "(function(){var v=window.visualViewport,w=v?Math.round(v.width*v.scale):innerWidth;document.documentElement.style.fontSize=Math.max(16,Math.min(13+0.007*w,20))+'px'})()";

function bootScript(input: BootInputs): string {
  const j = JSON.stringify;
  return `(function(){
var d=document.documentElement;
d.classList.add('p151-hub-images-pending');
function G(k){try{return localStorage.getItem(k)}catch(e){return null}}
function S(k){try{var s=JSON.parse(G(k)||'null');return s&&s.state||null}catch(e){return null}}
function some(o,f){for(var k in o)if(f(o[k]))return true;return false}
var L=${j(input.LOCALES)},q=new URLSearchParams(location.search),loc=q.get('lang'),dex=S(${j(STORE_KEY)}),lg=S('league-builder'),fv=S('favorite-picker');
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
var now=Date.now(),notice=now>=${input.FAVORITES_NOTICE_START}&&now<${input.FAVORITES_NOTICE_END}&&G(${j(input.FAVORITES_NOTICE_SEEN_KEY)})!=='1'&&(any||${j(input.RETURNING_KEYS)}.some(function(k){return G(k)!==null}));
if((loc||'en')!=='en'||notice||q.has('admin')||q.has('demo'))d.classList.add('p151-wait')})();`;
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
      // Inside the project, so the server bundle resolves react from node_modules.
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
        // The marker after the markup ends the hub. A browser with the
        // stylesheet already cached would paint the hub while its HTML is still
        // arriving, and the hub centres its content, so the rest would move what
        // was painted. `blocking="render"` holds the first paint until the
        // marker is parsed (Chromium); the `:has()` rule hides the hub until
        // then in other browsers.
        // React puts the screenshots' preloads at the start of the markup. They
        // go in the head instead, ahead of the inline stylesheet, so the
        // browser starts the images before it has read the styles.
        // Explicit React preloads put href before as; automatic preloads do not.
        const imagePreload = /<link\b(?=[^>]*\srel="preload")(?=[^>]*\sas="image")[^>]*\/>/g;
        const imagePreloads = markup.match(imagePreload) ?? [];
        html = html.replace(root, () => `<div id="root" data-prerendered>${markup.replace(imagePreload, '')}</div><span id="p151-end" hidden></span>`);
        const head = [
          `<link rel="preload" as="font" type="font/woff2" crossorigin href="${config.base}assets/${font}">`,
          ...imagePreloads,
          '<link rel="expect" href="#p151-end" blocking="render">',
          '<style>html .p151-boot{display:none}html.p151-wait .p151-boot{display:flex}html.p151-wait #root{display:none}</style>',
          '<style>html:not(:has(#p151-end)) #root{visibility:hidden}html.p151-hub-images-pending .hub-grid{visibility:hidden}'+['dex','league','favorites'].map(k=>`html.p151-hub-${k}-fallback .hub-card[data-hub-card="${k}"] [data-card-panel]{visibility:hidden}`).join('')+'</style>',
          `<script>${bootScript(inputs)}</script>`,
        ].join('\n    ');
        // Before any stylesheet: an inline script after one waits for it.
        const viewport = /<meta name="viewport"[^>]*>/;
        if (!viewport.test(html)) throw new Error('prerender-hub: index.html has no viewport meta tag');
        html = html.replace(viewport, (tag) => `${tag}\n    ${head}`);
        // The stylesheet goes inline. Under Lighthouse, a linked stylesheet that
        // arrived after about 170 ms held the first frame until about 1.3 or
        // 2.3 s, in every local run against the live site and in about half of
        // PageSpeed Insights' phone runs; inline, the hub painted at about
        // 0.2 s (11 October). After the page has loaded, a prefetch puts the
        // file in the cache for the tool pages, which still link it. A prefetch
        // in the HTML started at once and delayed the screenshots by about 5%.
        const sheets = [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+\.css)">/g)];
        if (sheets.length === 0) throw new Error('prerender-hub: index.html links no stylesheet');
        for (const [tag, href] of sheets) {
          const css = fs.readFileSync(path.join(outDir, href.slice(config.base.length)), 'utf8');
          if (css.includes('</style')) throw new Error(`prerender-hub: ${href} cannot be inlined`);
          html = html.replace(tag, () => `<style>${css}</style>`);
          const prefetch = `addEventListener('load',function(){var l=document.createElement('link');l.rel='prefetch';l.href=${JSON.stringify(href)};document.head.appendChild(l)})`;
          html = html.replace('</body>', () => `<script>${prefetch}</script>\n  </body>`);
        }
        // Reveal the complete grid in one frame, including the feedback card.
        // A failed image keeps its panel hidden while its caption stays usable.
        const ready = `(function(){
var d=document.documentElement,decoded=new WeakSet(),pending=new WeakSet();
function reveal(){var cards=Array.from(document.querySelectorAll('[data-hub-card]'));if(cards.length&&cards.every(function(card){var key=card.getAttribute('data-hub-card');return d.classList.contains('p151-hub-'+key+'-ready')||d.classList.contains('p151-hub-'+key+'-fallback')}))d.classList.remove('p151-hub-images-pending')}
function fallback(card){var key=card.getAttribute('data-hub-card');if(card.isConnected&&!d.classList.contains('p151-hub-'+key+'-ready')){d.classList.add('p151-hub-'+key+'-fallback');reveal()}}
function check(card){
if(!card)return;var key=card.getAttribute('data-hub-card'),imgs=Array.from(card.querySelectorAll('[data-artwork] img[alt]:not([alt=""])'));
if(!imgs.length||d.classList.contains('p151-hub-'+key+'-ready'))return;
if(imgs.some(function(img){return img.complete&&!img.naturalWidth})){fallback(card);return}
imgs.forEach(function(img){if(decoded.has(img)||pending.has(img))return;pending.add(img);img.decode().then(function(){decoded.add(img);check(img.closest('[data-hub-card]'))},function(){if(img.isConnected)fallback(img.closest('[data-hub-card]'))})});
if(imgs.some(function(img){return !decoded.has(img)}))return;
if(card.isConnected){d.classList.remove('p151-hub-'+key+'-fallback');d.classList.add('p151-hub-'+key+'-ready');reveal()}
}
function event(e){if(e.target instanceof HTMLImageElement)check(e.target.closest('[data-hub-card]'))}
document.addEventListener('load',event,true);document.addEventListener('error',event,true);
Array.from(document.querySelectorAll('[data-hub-card]')).forEach(check);
setTimeout(function(){Array.from(document.querySelectorAll('[data-hub-card]')).forEach(fallback)},8000)
})();`;
        html = html.replace('</body>', () => `<script>${ready}</script>\n  </body>`);
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
