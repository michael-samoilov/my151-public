/**
 * Capture the home page's tool screenshots from the real app.
 *
 * What this solves, and what it does not:
 *
 * - **Browser chrome, status bar.** A headless Chromium viewport is the page
 *   and nothing else. There is no URL bar, no notch, no clock or battery. A
 *   screenshot taken on a real phone has all three and has to be cropped;
 *   this has none to crop.
 * - **Rounded corners.** These stay OUT of the image on purpose. The card
 *   rounds them at render time with `border-radius` and `overflow: hidden`,
 *   scaled to the card, so one flat rectangle serves the 110px phone card and
 *   the 263px desktop card alike. Baking corners in would fix the radius to one
 *   size and leave a hard edge at every other. Every current asset is already a
 *   plain rectangle — all four corners are opaque page grey.
 * - **Resolution.** `SCALE` captures at 3x the phone viewport, then the output
 *   is resampled once to `OUT_WIDTH`. See the note on that constant.
 *
 * usage:
 *   node docs/future-tools/home-page/capture-shots.mjs            # all shots
 *   node docs/future-tools/home-page/capture-shots.mjs dex        # one, by key
 *   node docs/future-tools/home-page/capture-shots.mjs --list     # what exists
 *
 * It builds the app and serves it itself, so nothing needs to be running.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const OUT_DIR = join(REPO, 'src/assets/home');
const PORT = 4195;
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';

/** The viewport the app is designed against, and the one the card's aspect assumes. */
const VIEW = { width: 390, height: 844 };
/** Capture at 3x so the resample down has real detail to work from. */
const SCALE = 3;
/**
 * Output width in pixels. The card shows a screenshot at 64.3% of its own
 * width. The widest card is desktop's three-across at 1440: 409px, so 263 CSS
 * px of screenshot, which wants 789 device px on a 3x display. 800 covers it
 * with nothing to spare and nothing wasted — and it is nearly 3x what the
 * current assets carry, which is why they soften on a retina desktop.
 */
const OUT_WIDTH = 800;
/** Encoder quality. Dense sprite grids punish low values; 0.86 holds up. */
const QUALITY = 0.86;

/**
 * One entry per screenshot. `url` is the app path with whatever query the state
 * needs; `nav` is the view tab to click before shooting, if any. Add an entry
 * to add a shot — nothing else changes.
 *
 * `?demo=151` seeds a full Pokédex, which is what the dex shots want. `?demo`
 * modes are read in src/lib/demoMode.ts and never touch a real user's storage.
 */
const SHOTS = {
  dex: {
    file: 'tool-dex.webp',
    url: '/?demo=151',
    nav: 'builder',
    note: 'Builder, full 151 dex — the front card of the dex fan.',
  },
  'dex-b': {
    file: 'tool-dex-b.webp',
    url: '/?demo=151',
    nav: 'view',
    note: 'View page, same dex — the card behind it.',
  },
  league: {
    file: 'tool-league.webp',
    url: '/?demo=151',
    nav: 'builder',
    note: 'Placeholder until the league builder exists. Replace the url when it does.',
    skip: 'The league builder is not built yet; this asset is a mockup, not a capture.',
  },
  'league-b': {
    file: 'tool-league-b.webp',
    url: '/?demo=151',
    nav: 'builder',
    note: 'Placeholder until the league builder exists.',
    skip: 'The league builder is not built yet; this asset is a mockup, not a capture.',
  },
};

const kb = (n) => `${Math.round(n / 1024)}KB`;

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const [k, s] of Object.entries(SHOTS)) {
    console.log(`${k.padEnd(10)} ${s.file.padEnd(22)} ${s.url}  ${s.skip ? '[SKIPPED] ' : ''}${s.note}`);
  }
  process.exit(0);
}
const want = args.filter((a) => !a.startsWith('-'));
const todo = Object.entries(SHOTS).filter(([k, s]) => (want.length ? want.includes(k) : !s.skip));
if (!todo.length) {
  console.error(want.length ? `no shot named ${want.join(', ')} — try --list` : 'nothing to capture');
  process.exit(1);
}

console.log('building…');
execFileSync('npm', ['run', 'build'], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: REPO, stdio: 'ignore', detached: true,
});
const base = `http://localhost:${PORT}`;
try {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  // Wait for the preview server rather than sleeping a fixed amount.
  for (let i = 0; ; i += 1) {
    const p = await b.newPage();
    const ok = await p.goto(base, { timeout: 2000 }).then(() => true, () => false);
    await p.close();
    if (ok) break;
    if (i > 30) throw new Error('preview server never came up');
    await new Promise((r) => setTimeout(r, 500));
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const [key, shot] of todo) {
    const page = await b.newPage({ viewport: VIEW, deviceScaleFactor: SCALE });
    await page.goto(base + shot.url, { waitUntil: 'networkidle' });
    if (shot.nav) {
      const tab = page.locator(`[data-nav="${shot.nav}"]`).first();
      if (await tab.count()) await tab.click();
    }
    // Sprites arrive after mount; wait for them to decode rather than guess.
    await page.waitForFunction(
      () =>
        [...document.images]
          .filter((i) => {
            const r = i.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.width > 0;
          })
          .every((i) => i.complete && i.naturalWidth > 0),
      null,
      { timeout: 15000 },
    ).catch(() => console.warn(`  ${key}: some on-screen images never loaded — check the shot`));
    await page.waitForTimeout(600);
    const png = await page.screenshot();
    await page.close();

    const webp = await encode(b, png, OUT_WIDTH);
    const out = join(OUT_DIR, shot.file);
    const before = existsSync(out) ? readFileSync(out).length : 0;
    writeFileSync(out, webp);
    const h = Math.round((OUT_WIDTH * VIEW.height) / VIEW.width);
    console.log(
      `${key.padEnd(10)} ${shot.file.padEnd(22)} ${OUT_WIDTH}x${h}  ${kb(webp.length)}` +
        (before ? `  (was ${kb(before)})` : '  (new)'),
    );
  }
  await b.close();
} finally {
  try { process.kill(-server.pid); } catch { /* already gone */ }
}

/**
 * PNG in, WebP out, resampled to `width`. This box has no image tooling, so the
 * encode goes through a canvas in the same browser that took the shot.
 */
async function encode(browser, png, width, quality = QUALITY) {
  const page = await browser.newPage();
  const uri = await page.evaluate(
    ([b64, w, q]) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onerror = () => rej(new Error('decode failed'));
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = Math.round((w * img.height) / img.width);
          const x = c.getContext('2d');
          x.imageSmoothingQuality = 'high';
          x.drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/webp', q));
        };
        img.src = 'data:image/png;base64,' + b64;
      }),
    [png.toString('base64'), width, quality],
  );
  await page.close();
  if (!uri.startsWith('data:image/webp')) throw new Error('browser refused to encode webp');
  return Buffer.from(uri.split(',')[1], 'base64');
}
