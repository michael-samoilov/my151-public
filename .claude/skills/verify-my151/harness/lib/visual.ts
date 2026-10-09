// Visual diff for diff mode: the same fixed screens on the base and the change,
// compared pixel by pixel, so a change that moves or repaints something no check
// covers still shows up. Nothing is stored as a baseline: both builds render in
// the same run, in the same browser, so the comparison needs no snapshot files.
//
// Each screen renders four times: each build twice. A region that differs
// between two renders of the same build is noise (a timer, a lazy image), and
// it is reported as unstable instead of as a change. Every other changed
// region is listed with the text under it, for the agent to match against the
// change's "must change" list. A region that matches nothing blocks the merge.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { REPO_ROOT } from './servers.ts';
import { resolveChromium } from './engines.ts';

interface Viewport { name: string; width: number; height: number; scale: number; mobile: boolean }
const VIEWPORTS: Viewport[] = [
  { name: '390', width: 390, height: 844, scale: 2, mobile: true },
  { name: '1280', width: 1280, height: 900, scale: 1, mobile: false },
];

interface Screen {
  id: string;
  path: string;
  /** localStorage entries set before the page's own scripts run. */
  seed?: Record<string, string>;
  /** Steps after load, such as opening a tab or a menu. */
  act?: (page: Page) => Promise<void>;
}

const read = (file: string) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
const LEAGUE = { 'league-builder': read('docs/future-tools/home-page/league-fixture.json') };
const FAVORITES = {
  'favorite-picker': JSON.stringify({ state: { fills: JSON.parse(read('docs/favorite-picker-work/export/seed.json')).fills }, version: 3 }),
};
// The verifier's 37-Pokémon in-progress dex, as in scripts/capture-tool-art.mjs.
const DEX = {
  'personal-151-pokedex-v3': JSON.stringify({
    state: {
      sections: {
        starter: [387, 388, 389, 255, 256, 257, 656, 657, 658],
        'early-bug': [736, 737, 738, 543, 544, 545, 123, 212, 900],
        forest: [46, 47, 453, 454, 708, 709, 56, 57, 979, 273, 274, 275, 216, 217, 901, 252, 253, 254, 640],
      },
      milestoneMax: 37, milestoneCelebrated: [25], localeNoticeSeen: true, locale: 'en',
    },
    version: 10,
  }),
};

const click = (selector: string) => async (page: Page) => { await page.locator(selector).first().click(); };
const openTools = async (page: Page) => { await page.locator('button[aria-expanded]').filter({ hasText: /tools/i }).first().click(); };
/** Open a picker cell and wait until every sprite in its selector has its pixels. */
const openPickerCell = (cell: string) => async (page: Page) => {
  await page.getByTestId(`favorites-cell-${cell}`).click();
  const sprites = page.locator('#favorites-selector [data-testid^="favorites-pick-"] img[alt]:not([alt=""])');
  await sprites.first().waitFor({ timeout: 30_000 });
  await page.waitForFunction((selector) => [...document.querySelectorAll(selector)]
    .every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 1),
  '#favorites-selector [data-testid^="favorites-pick-"] img[alt]:not([alt=""])', { timeout: 30_000 });
};

/** The fixed screen set. Add a screen when a change touches a state this list does not reach. */
export const SCREENS: Screen[] = [
  { id: 'hub', path: '/' },
  { id: 'hub-progress', path: '/', seed: { ...DEX, ...LEAGUE, ...FAVORITES } },
  { id: 'builder-intro', path: '/pokedex-builder' },
  { id: 'builder-tools-menu', path: '/pokedex-builder', act: openTools },
  { id: 'builder-progress', path: '/pokedex-builder', seed: DEX },
  { id: 'builder-demo', path: '/pokedex-builder?demo=151' },
  { id: 'builder-analytics', path: '/pokedex-builder?demo=151', act: click('[data-nav="analytics"]') },
  { id: 'builder-view', path: '/pokedex-builder?demo=151', act: click('[data-nav="view"]') },
  {
    id: 'builder-export', path: '/pokedex-builder?demo=151',
    act: async (page) => {
      await click('[data-nav="view"]')(page);
      await click('[data-dex-export]')(page);
      await page.locator('[data-dex-export-confirm]:not([disabled])').waitFor({ timeout: 60_000 });
    },
  },
  { id: 'league', path: '/custom-gym-leader' },
  { id: 'league-home', path: '/custom-gym-leader', seed: LEAGUE },
  { id: 'league-card', path: '/custom-gym-leader', seed: LEAGUE, act: click('[data-testid="league-slot-0"]') },
  { id: 'league-tools-menu', path: '/custom-gym-leader', seed: LEAGUE, act: openTools },
  { id: 'favorites', path: '/favorite-pokemon-picker' },
  { id: 'favorites-filled', path: '/favorite-pokemon-picker', seed: FAVORITES },
  { id: 'favorites-selector', path: '/favorite-pokemon-picker', act: openPickerCell('water-1') },
  { id: 'favorites-selector-filled', path: '/favorite-pokemon-picker', seed: FAVORITES, act: openPickerCell('fire-5') },
  {
    id: 'favorites-export', path: '/favorite-pokemon-picker', seed: FAVORITES,
    act: async (page) => {
      await click('[data-testid="favorites-export-open"]')(page);
      await page.locator('[data-testid="favorites-export-save"]:not([disabled])').waitFor({ timeout: 60_000 });
      await page.locator('[data-export-preview-layer] img[src^="blob:"]').first().waitFor({ timeout: 60_000 });
    },
  },
];

export interface Region { x: number; y: number; w: number; h: number; pixels: number; unstable: boolean; text: string }
export interface ScreenResult {
  screen: string; viewport: string; error?: string;
  size: { base: [number, number]; after: [number, number] };
  regions: Region[];
}
export interface VisualReport { screens: ScreenResult[]; changed: number; regions: number; unstable: number; errors: number }

/**
 * Wait until fonts, the images on screen and two frames have settled. Lazy
 * images below the fold never load, so the wait covers only images inside the
 * viewport, and gives up after 5 s.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const onScreen = [...document.images].filter((i) => {
      const r = i.getBoundingClientRect();
      return !i.complete && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    });
    const loaded = Promise.all(onScreen.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })));
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 5000))]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(500);
}

async function render(browser: Browser, url: string, screen: Screen, vp: Viewport): Promise<{ page: Page; png: Buffer }> {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale,
    isMobile: vp.mobile, hasTouch: vp.mobile, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  await ctx.addInitScript(NAME_SHIM);
  if (screen.seed) await ctx.addInitScript((seed) => { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); }, screen.seed);
  const page = await ctx.newPage();
  await page.goto(url + screen.path, { waitUntil: 'load' });
  await settle(page);
  if (screen.act) { await screen.act(page); await settle(page); }
  await page.evaluate(PIN_BUILD_STAMP);
  const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  return { page, png };
}

/**
 * Compare two PNGs on a canvas in the browser: no image library is installed,
 * and Chromium already decodes PNG. Changed pixels are binned into 8 px cells,
 * cells within 3 cells of each other join one region, and each region comes
 * back as a box in screenshot pixels.
 */
async function diffBoxes(page: Page, a: Buffer, b: Buffer): Promise<Array<{ x: number; y: number; w: number; h: number; pixels: number }>> {
  return page.evaluate(async ([a64, b64]) => {
    const load = async (src: string) => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const [ia, ib] = await Promise.all([load(`data:image/png;base64,${a64}`), load(`data:image/png;base64,${b64}`)]);
    const W = Math.max(ia.width, ib.width), H = Math.max(ia.height, ib.height);
    const pixels = (img: HTMLImageElement) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d')!; g.fillStyle = '#ff00ff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, W, H).data;
    };
    const pa = pixels(ia), pb = pixels(ib);
    const CELL = 8, cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
    const count = new Uint32Array(cw * ch);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) > 24) count[Math.floor(y / CELL) * cw + Math.floor(x / CELL)]++;
    }
    const seen = new Uint8Array(cw * ch), out: Array<{ x: number; y: number; w: number; h: number; pixels: number }> = [];
    const REACH = 3;
    for (let start = 0; start < count.length; start++) {
      if (!count[start] || seen[start]) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0; const stack = [start]; seen[start] = 1;
      while (stack.length) {
        const c = stack.pop()!; const cx = c % cw, cy = Math.floor(c / cw);
        x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy); n += count[c];
        for (let dy = -REACH; dy <= REACH; dy++) for (let dx = -REACH; dx <= REACH; dx++) {
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const k = ny * cw + nx; if (count[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
      out.push({ x: x0 * CELL, y: y0 * CELL, w: Math.min(W, (x1 + 1) * CELL) - x0 * CELL, h: Math.min(H, (y1 + 1) * CELL) - y0 * CELL, pixels: n });
    }
    return out;
  }, [a.toString('base64'), b.toString('base64')] as const);
}

// tsx compiles this file with esbuild, which wraps named functions in a
// `__name()` helper. Callbacks passed to page.evaluate run in the page, where
// that helper does not exist, so every page gets a no-op stand-in.
const NAME_SHIM = 'globalThis.__name = globalThis.__name || ((f) => f);';

// The footer's build stamp is the build minute (PageFooter.tsx). buildIn gives
// both builds one SOURCE_DATE_EPOCH, but a base ref older than vite.config.ts's
// SOURCE_DATE_EPOCH support, or a --no-build tree, still stamps its own build
// minute. This pin is the fallback for those: it rewrites the stamp on both.
// React renders "v " and the digits as two text nodes, so match the digits
// node after a node that ends in "v ".
const PIN_BUILD_STAMP = `(() => {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let prev = '';
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    const text = t.textContent;
    const pinned = /^\\d{10}$/.test(text.trim()) && /v\\s*$/.test(prev) ? '0000000000' : text.replace(/\\bv \\d{10}\\b/g, 'v 0000000000');
    if (pinned !== text) t.textContent = pinned;
    prev = pinned;
  }
})()`;

const overlaps = (r: { x: number; y: number; w: number; h: number }, s: { x: number; y: number; w: number; h: number }) =>
  r.x < s.x + s.w && s.x < r.x + r.w && r.y < s.y + s.h && s.y < r.y + r.h;

/** The visible text under a region of the change's render, so the report names what changed. */
async function textAt(page: Page, box: { x: number; y: number; w: number; h: number }, scale: number): Promise<string> {
  return page.evaluate(([x, y, w, h]) => {
    const inBox = (e: Element) => {
      const r = e.getBoundingClientRect(); const left = r.left + scrollX, top = r.top + scrollY;
      return r.width > 0 && r.height > 0 && left < x + w && x < left + r.width && top < y + h && y < top + r.height;
    };
    const ownText = (e: Element) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).filter(Boolean).join(' ');
    const words = [...document.querySelectorAll('body *')].filter((e) => inBox(e) && ownText(e)).map(ownText);
    // Graphics carry their name in alt or aria-label text.
    const labels = [...document.querySelectorAll('img[alt]:not([alt=""]),[aria-label]')].filter(inBox).map((e) => e.getAttribute('alt') ?? e.getAttribute('aria-label')!);
    return ([...new Set(words)].join(' | ') || [...new Set(labels)].join(' | ') || '(no text: graphics or layout)').slice(0, 160);
  }, [box.x / scale, box.y / scale, box.w / scale, box.h / scale] as const);
}

export async function runVisualDiff(baseUrl: string, afterUrl: string, dir: string, only?: string[]): Promise<VisualReport> {
  const out = path.join(dir, 'visual'); fs.mkdirSync(out, { recursive: true });
  const executablePath = resolveChromium();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(executablePath ? { executablePath } : {}) });
  const screens: ScreenResult[] = [];
  try {
    const scratch = await (await browser.newContext()).newPage();
    await scratch.evaluate(NAME_SHIM);
    for (const screen of SCREENS.filter((sc) => !only || only.includes(sc.id))) for (const vp of VIEWPORTS) {
      const name = `${screen.id}-${vp.name}`;
      try {
        // One stuck screen must not stall the run: give each render 90 s.
        const cap = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error('render took longer than 90 s')), 90_000))]);
        // Two renders of each build: a region that differs between two renders
        // of the same build is noise, whichever build it flickers on.
        const after = await cap(render(browser, afterUrl, screen, vp));
        const afterB = await cap(render(browser, afterUrl, screen, vp));
        const baseA = await cap(render(browser, baseUrl, screen, vp));
        const baseB = await cap(render(browser, baseUrl, screen, vp));
        await afterB.page.context().close(); await baseA.page.context().close(); await baseB.page.context().close();
        fs.writeFileSync(path.join(out, `${name}--before.png`), baseA.png);
        fs.writeFileSync(path.join(out, `${name}--after.png`), after.png);
        const noise = [...await diffBoxes(scratch, baseA.png, baseB.png), ...await diffBoxes(scratch, after.png, afterB.png)];
        const changes = await diffBoxes(scratch, baseA.png, after.png);
        const regions: Region[] = [];
        for (const c of changes) regions.push({ ...c, unstable: noise.some((n) => overlaps(c, n)), text: await textAt(after.page, c, vp.scale) });
        await after.page.context().close();
        const size = async (png: Buffer) => scratch.evaluate(async (b64) => { const i = new Image(); i.src = `data:image/png;base64,${b64}`; await i.decode(); return [i.width, i.height] as [number, number]; }, png.toString('base64'));
        screens.push({ screen: screen.id, viewport: vp.name, size: { base: await size(baseA.png), after: await size(after.png) }, regions });
      } catch (e) {
        screens.push({ screen: screen.id, viewport: vp.name, error: (e as Error).message.split('\n')[0], size: { base: [0, 0], after: [0, 0] }, regions: [] });
      }
    }
    const report: VisualReport = {
      screens,
      changed: screens.filter((s) => s.regions.some((r) => !r.unstable)).length,
      regions: screens.reduce((n, s) => n + s.regions.filter((r) => !r.unstable).length, 0),
      unstable: screens.reduce((n, s) => n + s.regions.filter((r) => r.unstable).length, 0),
      errors: screens.filter((s) => s.error).length,
    };
    fs.writeFileSync(path.join(dir, 'visual.json'), JSON.stringify(report, null, 2));
    await writeSheet(scratch, report, out, path.join(dir, 'visual.png'));
    return report;
  } finally { await browser.close(); }
}

/** One picture for the report: each changed screen whole, before and after, boxes on every region, and close-ups. */
async function writeSheet(page: Page, report: VisualReport, shots: string, file: string): Promise<void> {
  const changed = report.screens.filter((s) => s.regions.length);
  const uri = (f: string) => `data:image/png;base64,${fs.readFileSync(path.join(shots, f)).toString('base64')}`;
  const rows = changed.map((s) => {
    const name = `${s.screen}-${s.viewport}`; const vp = VIEWPORTS.find((v) => v.name === s.viewport)!;
    const thumbW = vp.mobile ? 220 : 420, k = thumbW / (vp.width * vp.scale);
    const boxes = s.regions.map((r) => `<i class="${r.unstable ? 'u' : 'c'}" style="left:${r.x * k - 3}px;top:${r.y * k - 3}px;width:${r.w * k + 6}px;height:${r.h * k + 6}px"></i>`).join('');
    const whole = (tag: 'before' | 'after', size: [number, number]) => `<figure><div class="f" style="width:${thumbW}px;height:${size[1] * k}px"><img src="${uri(`${name}--${tag}.png`)}" style="width:${size[0] * k}px">${boxes}</div><figcaption>${tag}</figcaption></figure>`;
    const zooms = s.regions.slice(0, 4).map((r, i) => {
      const pad = 24 * vp.scale, x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad), w = r.w + 2 * pad, h = r.h + 2 * pad, z = Math.min(1, 380 / w, 220 / h);
      const crop = (tag: string, size: [number, number]) => `<div class="z" style="width:${w * z}px;height:${h * z}px"><img src="${uri(`${name}--${tag}.png`)}" style="width:${size[0] * z}px;left:${-x * z}px;top:${-y * z}px"></div>`;
      return `<div class="zr"><b>${i + 1}${r.unstable ? ' (unstable)' : ''}</b> ${r.text.replace(/</g, '&lt;')}<div class="zp">${crop('before', s.size.base)}${crop('after', s.size.after)}</div></div>`;
    }).join('');
    return `<section><h2>${name}</h2><div class="p">${whole('before', s.size.base)}${whole('after', s.size.after)}</div>${zooms}</section>`;
  }).join('');
  const quiet = report.screens.filter((s) => !s.regions.length && !s.error).map((s) => `${s.screen}-${s.viewport}`).join(', ');
  const errors = report.screens.filter((s) => s.error).map((s) => `${s.screen}-${s.viewport}: ${s.error}`).join('<br>');
  await page.setViewportSize({ width: 900, height: 600 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}body{font:14px/1.4 system-ui,sans-serif;background:#f1f3f4;color:#202124;padding:20px;width:900px}
    h1{font-size:20px}h2{font-size:15px;margin-bottom:8px}section{background:#fff;border:1px solid #dadce0;border-radius:12px;padding:12px;margin-top:14px}
    .p,.zp{display:flex;gap:14px;justify-content:center}figure{margin:0}figcaption{text-align:center;color:#5f6368;font-size:12px}
    .f{position:relative;overflow:hidden;border:1px solid #dadce0}.f img{display:block}.f i{position:absolute;border:2px solid #d93025}.f i.u{border:2px dashed #f29900}
    .zr{margin-top:10px;font-size:13px}.zp{margin-top:4px}.z{position:relative;overflow:hidden;border:2px solid #d93025}.z img{position:absolute;max-width:none}
    .note{margin-top:14px;color:#5f6368}</style>
    <h1>Visual diff: ${report.changed} of ${report.screens.length} screens changed, ${report.regions} regions${report.unstable ? `, ${report.unstable} unstable` : ''}</h1>
    <div class="note">Red: changed. Dashed orange: also differs between two renders of the base, so it is noise.</div>
    ${rows}<div class="note"><b>No change:</b> ${quiet || 'none'}</div>${errors ? `<div class="note"><b>Errors:</b><br>${errors}</div>` : ''}`);
  await page.evaluate(NAME_SHIM);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))));
  await page.screenshot({ path: file, fullPage: true });
}
