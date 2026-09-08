/**
 * Capture the home page's tool screenshots from the real apps.
 *
 * What this solves, and what it does not:
 *
 * - **Browser chrome, status bar, app chrome.** A headless Chromium viewport is
 *   the page and nothing else: no URL bar, no notch, no clock or battery, so
 *   there is nothing to crop. The app's own two headers — the wordmark bar and
 *   the per-page bar under it — ARE in the viewport, so the capture drops them
 *   and keeps a full phone's height of content below, which is what a visitor
 *   scrolled past them would see.
 * - **Edge to edge.** Every shot is taken at a real phone's width, so the page
 *   lays itself out for a phone and nothing is cut off at the sides. The old
 *   assets were a wider render cropped to a phone's shape, which read as
 *   zoomed in.
 * - **Rounded corners.** These stay OUT of the image on purpose. The card
 *   rounds them at render time with `border-radius` and `overflow: hidden`,
 *   scaled to the card, so one flat rectangle serves the 110px phone card and
 *   the 263px desktop card alike. Baking corners in would fix the radius to one
 *   size and leave a hard edge at every other. `PHONE_RADIUS` in HomePage.tsx
 *   holds the proportion, taken from a phone rather than from the app's cards.
 * - **Resolution.** `SCALE` captures at 3x the phone viewport, then the output
 *   is resampled once to `OUT_WIDTH`. See the note on that constant.
 *
 * usage:
 *   node docs/future-tools/home-page/capture-shots.mjs            # all shots
 *   node docs/future-tools/home-page/capture-shots.mjs dex        # one, by key
 *   node docs/future-tools/home-page/capture-shots.mjs --list     # what exists
 *
 * It builds each app and serves it itself, so nothing needs to be running.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const OUT_DIR = join(REPO, 'src/assets/home');
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';

/** The viewport the app is designed against, and the one the card's aspect assumes. */
const VIEW = { width: 390, height: 844 };
/** Capture at 3x so the resample down has real detail to work from. */
const SCALE = 3;
/**
 * Output width in pixels. The card shows a screenshot at 64.3% of its own
 * width. The widest card is desktop's three-across at 1440: 409px, so 263 CSS
 * px of screenshot, which wants 789 device px on a 3x display. 800 covers that
 * with nothing wasted, and it is nearly 3x what the assets carried before,
 * which is why those softened on a retina desktop.
 */
const OUT_WIDTH = 800;
/** Encoder quality. Dense sprite grids punish low values; 0.86 holds up. */
const QUALITY = 0.86;
/**
 * Air above every shot, as a share of its width.
 *
 * The card rounds the shot's corners at a phone's radius, and that curve eats
 * into the first rows of pixels. 2.5% is 20px on an 800px-wide shot, which puts
 * the curve 30px in from the left where the content begins — inside the margin
 * every one of these images already carries.
 *
 * The band takes the shot's own top-left colour, so it extends whatever is
 * already there: the page's grey on an app shot, the card's frame on the
 * trainer card export.
 */
const PAD = 0.025;

/**
 * The league builder still lives on its own branch. Until it merges, its two
 * shots come from a worktree of that branch, built and served beside this one.
 * Once `pokemon-league-builder.html` is in this tree, the worktree is skipped
 * and both apps come from the same build — nothing else changes.
 */
const LEAGUE_BRANCH = 'origin/claude/pokemon-league-builder-soqxj6';
const LEAGUE_ENTRY = 'pokemon-league-builder.html';

/**
 * The league state the two league shots are taken against.
 *
 * A fixture rather than the app's own Kanto seed: the seed leaves two rows
 * blank on purpose, to keep the empty state in front of whoever is working on
 * the page, and it gives Brock a different team from the card in the shot. This
 * is that seed with the vacancies filled, Brock's card as the shot wants it,
 * and the champion carrying neither a Mega nor a legendary. It is written
 * straight into the store's own persisted key before the app boots, so no
 * source change is needed to reproduce either shot.
 */
/**
 * The corner radius the card rounds each shot at, as a share of its width.
 *
 * Kept in step with `PHONE_RADIUS` in HomePage.tsx: this script checks that
 * nothing but the band's own colour falls inside that curve, which is the whole
 * reason the band exists.
 */
const PHONE_RADIUS = 0.121;
/**
 * How far a pixel must sit from the band's colour to count as ink.
 *
 * The check below is about text and sprites, not about every pixel. The dex
 * export's top-right section outline is a pale hairline that the curve grazes
 * by three pixels — 0.4 of a pixel at the card's phone size, and a rounded box
 * corner rather than a letter. Ink is what a reader would notice losing, and at
 * this threshold none of the four assets has any inside the curve.
 */
const INK = 60;

const LEAGUE_FIXTURE = join(HERE, 'league-fixture.json');
const LEAGUE_KEY = 'league-builder';

/**
 * One entry per screenshot.
 *
 * `kind: 'page'` shoots the app itself: `url` is the path with whatever query
 * the state needs, `nav` is the view tab to press first, and `scrollTo` names a
 * heading to bring to the top of the frame. `?demo=151` seeds a full Pokédex
 * (see src/lib/demoMode.ts) and never touches a real user's storage.
 *
 * `kind: 'export'` shoots the PNG the app exports rather than the app, through
 * the same button a person presses: `exportButton` finds it, `open` names the
 * league slot to open first, and `fixture` writes the league state below. A
 * Pokédex and a trainer card are both made to be shared as images, so the image
 * is the honest thing to show — footer line and all.
 *
 * An export ends at its own bottom edge; a page shot keeps a full phone's
 * height of content below the chrome.
 */
const SHOTS = {
  dex: {
    file: 'tool-dex.webp',
    app: 'dex',
    kind: 'export',
    url: '/?demo=151',
    nav: 'view',
    // The View page's export button carries no label; it is the one button on
    // the page with a download icon.
    exportButton: 'button:visible:has(svg.lucide-download)',
    note: 'View page export, full 151 dex, build-order outlines on — the front card of the dex fan.',
  },
  'dex-b': {
    file: 'tool-dex-b.webp',
    app: 'dex',
    kind: 'page',
    url: '/?demo=151',
    nav: 'analytics',
    scrollTo: 'Pokémon Type',
    note: 'Analytics, scrolled past What’s Missing to the type charts — the card behind it.',
  },
  league: {
    file: 'tool-league.webp',
    app: 'league',
    kind: 'export',
    fixture: true,
    exportButton: 'button[aria-label="Export trainer card"]',
    open: 0,
    note: 'Gym card export, Brock as the fixture sets him — the front card of the league fan.',
  },
  'league-b': {
    file: 'tool-league-b.webp',
    app: 'league',
    kind: 'export',
    fixture: true,
    exportButton: 'button[aria-label="Export league"]',
    note: 'League summary export, story teams, no vacancies — the card behind it.',
  },
};

const kb = (n) => `${Math.round(n / 1024)}KB`;

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const [k, s] of Object.entries(SHOTS)) {
    console.log(`${k.padEnd(10)} ${s.file.padEnd(22)} ${s.app.padEnd(7)} ${s.kind.padEnd(7)} ${s.note}`);
  }
  process.exit(0);
}
const want = args.filter((a) => !a.startsWith('-'));
const todo = Object.entries(SHOTS).filter(([k]) => (want.length ? want.includes(k) : true));
if (!todo.length) {
  console.error(`no shot named ${want.join(', ')} — try --list`);
  process.exit(1);
}

const servers = [];
const origins = {};
try {
  if (todo.some(([, s]) => s.app === 'dex')) origins.dex = await serve(REPO, 4195);
  if (todo.some(([, s]) => s.app === 'league')) origins.league = await serve(leagueTree(), 4196);

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [key, shot] of todo) {
    const raw = shot.kind === 'export'
      ? await exportShot(browser, origins[shot.app], shot)
      : await pageShot(browser, origins[shot.app], shot);
    const png = await band(browser, raw);
    await assertCornersClear(browser, png, key);
    const webp = await encode(browser, png, OUT_WIDTH);
    const out = join(OUT_DIR, shot.file);
    const before = existsSync(out) ? readFileSync(out).length : 0;
    writeFileSync(out, webp);
    const h = await heightOf(browser, webp, OUT_WIDTH);
    console.log(
      `${key.padEnd(10)} ${shot.file.padEnd(22)} ${OUT_WIDTH}x${h}  ${kb(webp.length)}` +
        (before ? `  (was ${kb(before)})` : '  (new)'),
    );
  }
  await browser.close();
} finally {
  for (const pid of servers) {
    try { process.kill(-pid); } catch { /* already gone */ }
  }
}

/**
 * The tree the league app builds from: this one once the league builder has
 * merged, and a worktree of its branch until then.
 */
function leagueTree() {
  if (existsSync(join(REPO, LEAGUE_ENTRY))) return REPO;
  const tree = join(REPO, '.league-shot-tree');
  if (!existsSync(tree)) {
    console.log(`league builder not in this tree — checking out ${LEAGUE_BRANCH}`);
    execFileSync('git', ['fetch', 'origin', LEAGUE_BRANCH.replace(/^origin\//, '')], { cwd: REPO, stdio: 'inherit' });
    execFileSync('git', ['worktree', 'add', '--detach', tree, LEAGUE_BRANCH], { cwd: REPO, stdio: 'inherit' });
    execFileSync('ln', ['-s', join(REPO, 'node_modules'), join(tree, 'node_modules')], { stdio: 'inherit' });
  }
  return tree;
}

/** Build a tree and serve its `dist` until this process exits. */
async function serve(cwd, port) {
  console.log(`building ${cwd === REPO ? 'this tree' : cwd}…`);
  execFileSync('npm', ['run', 'build'], { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd, stdio: 'ignore', detached: true,
  });
  servers.push(server.pid);
  // `--strictPort` makes the server exit rather than move when the port is
  // taken, and the readiness probe below would then pass against whatever was
  // already there — a different app, serving a page with none of the elements
  // this script drives. Watching for the exit names that instead.
  let died = false;
  server.on('exit', () => { died = true; });
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  // Wait for the server rather than sleeping a fixed amount.
  for (let i = 0; ; i += 1) {
    const page = await browser.newPage();
    const ok = await page.goto(base, { timeout: 2000 }).then(() => true, () => false);
    await page.close();
    if (died) throw new Error(`preview server for ${cwd} exited — is port ${port} already taken?`);
    if (ok) break;
    if (i > 30) throw new Error(`preview server on ${port} never came up`);
    await new Promise((r) => setTimeout(r, 500));
  }
  await browser.close();
  return base;
}

/**
 * A phone's worth of app, with the app's own two headers cut off the top.
 *
 * The viewport is a phone plus the headers' height, so what is left after the
 * cut is exactly a phone. Measuring the headers rather than assuming a number
 * keeps this right when either bar changes: the cut lands at the top of the
 * first thing that is neither.
 */
async function pageShot(browser, base, shot) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: SCALE });
  await page.goto(base + shot.url, { waitUntil: 'networkidle' });
  if (shot.nav) {
    const tab = page.locator(`[data-nav="${shot.nav}"]`).first();
    if (await tab.count()) await tab.click();
  }
  await page.waitForTimeout(400);
  const chrome = await headerHeight(page);
  await page.setViewportSize({ width: VIEW.width, height: VIEW.height + chrome });
  await page.waitForTimeout(600);
  if (shot.scrollTo) await scrollToHeading(page, shot.scrollTo, chrome);
  await settle(page, shot);
  const png = await page.screenshot({
    clip: { x: 0, y: chrome, width: VIEW.width, height: VIEW.height },
  });
  await page.close();
  return png;
}

/**
 * Where the app's chrome ends: the bottom of the bar under the wordmark.
 *
 * Every view keeps its own milestone bar and only one view is on screen, so
 * this takes the bar that has a size — the others are inside `hidden` panes and
 * measure zero. From there it climbs to the row that draws the rule under
 * itself, which is the bottom of the chrome by definition.
 */
function headerHeight(page) {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    const bar = [...document.querySelectorAll('.milestone-bar')].find(
      (b) => b.getBoundingClientRect().width > 0,
    );
    const row = bar?.closest('.border-b');
    if (!row) throw new Error('no visible milestone bar row — the header markup has moved');
    return Math.round(
      Math.max(header ? header.getBoundingClientRect().bottom : 0, row.getBoundingClientRect().bottom),
    );
  });
}

/** Bring a section heading to the top of the frame, just under the cut. */
async function scrollToHeading(page, text, chrome) {
  const moved = await page.evaluate(
    ([wanted, top]) => {
      const heading = [...document.querySelectorAll('h1, h2, h3')].find(
        (h) => h.textContent.trim() === wanted,
      );
      if (!heading) return false;
      const scroller = heading.closest('.overflow-y-auto') ?? document.scrollingElement;
      // 16px of air above it, so the heading does not sit on the cut.
      scroller.scrollTop += heading.getBoundingClientRect().top - top - 16;
      return true;
    },
    [text, chrome],
  );
  if (!moved) throw new Error(`no heading reads "${text}" — the section may have been renamed`);
  await page.waitForTimeout(500);
}

/** Wait for what is on screen to finish drawing, rather than guessing. */
async function settle(page, shot) {
  await page
    .waitForFunction(
      () =>
        [...document.images]
          .filter((i) => {
            const r = i.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.width > 0;
          })
          .every((i) => i.complete && i.naturalWidth > 0),
      null,
      { timeout: 15000 },
    )
    .catch(() => console.warn(`  ${shot.file}: some on-screen images never loaded — check the shot`));
  await page.waitForTimeout(600);
}

/**
 * The PNG an app exports, shown at a phone's width.
 *
 * The export goes through the app's own button, so the shot is the file a
 * visitor would get, not a re-render of it.
 */
async function exportShot(browser, base, shot) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, acceptDownloads: true });
  if (shot.fixture) {
    const fixture = readFileSync(LEAGUE_FIXTURE, 'utf8');
    await context.addInitScript(
      ([key, value]) => {
        try { localStorage.setItem(key, value); } catch { /* private mode: fall back to the seed */ }
      },
      [LEAGUE_KEY, fixture],
    );
  }
  const page = await context.newPage();
  await page.goto(base + (shot.url ?? `/${LEAGUE_ENTRY.replace(/\.html$/, '')}`), { waitUntil: 'networkidle' });
  if (shot.nav) {
    await page.locator(`[data-nav="${shot.nav}"]`).first().click();
  }
  if (shot.open !== undefined) {
    // Wait for the league's own rows rather than a fixed sleep: the store
    // hydrates from the fixture after mount, and a cold preview server makes
    // that slower than any sleep worth writing.
    const rows = page.locator('button.block.w-full.cursor-pointer');
    await rows.first().waitFor({ state: 'visible', timeout: 30000 });
    await rows.nth(shot.open).click({ force: true });
  }
  const button = page.locator(shot.exportButton).first();
  await button.waitFor({ state: 'visible', timeout: 30000 });
  // The dex export button stays disabled until the Pokédex has loaded, and
  // every export draws the sprites it is about to paint.
  await page.waitForFunction((sel) => !document.querySelector(sel)?.disabled, shot.exportButton.replace(':visible', ''));
  await settle(page, shot);
  const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    button.click({ force: true }),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = Buffer.concat(chunks);
  await context.close();
  return frame(browser, exported, ground);
}

/**
 * An exported image at a phone's width, and nothing below it.
 *
 * The export is shorter than a phone in proportion, so the frame ends at the
 * image's own bottom edge rather than padding out to a full phone. The card
 * clips every shot well above that anyway; what this saves is a fifth of the
 * file and a band of dead colour in the asset itself.
 */
async function frame(browser, png, ground) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: SCALE });
  await page.setContent(
    `<style>html,body{margin:0;background:${ground}}img{display:block;width:100vw}</style>` +
      `<img src="data:image/png;base64,${png.toString('base64')}">`,
  );
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  const height = await page.evaluate(() => Math.ceil(document.images[0].getBoundingClientRect().height));
  await page.setViewportSize({ width: VIEW.width, height });
  const shot = await page.screenshot();
  await page.close();
  return shot;
}

/**
 * Extend a shot's own top-left colour upward by `PAD` of its width.
 *
 * Sampled rather than named: the app's shots open on the page's grey and the
 * trainer card export opens on its frame, and both want their own colour. One
 * canvas reads the pixel and paints the band in the same pass.
 */
async function band(browser, png) {
  const page = await browser.newPage();
  const uri = await page.evaluate(
    ([b64, share]) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onerror = () => rej(new Error('decode failed'));
        img.onload = () => {
          const pad = Math.round(img.width * share);
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height + pad;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(img, 0, 0);
          const [r, g, b] = x.getImageData(2, 2, 1, 1).data;
          x.clearRect(0, 0, c.width, c.height);
          x.fillStyle = `rgb(${r},${g},${b})`;
          x.fillRect(0, 0, c.width, pad);
          x.drawImage(img, 0, pad);
          res(c.toDataURL('image/png'));
        };
        img.src = 'data:image/png;base64,' + b64;
      }),
    [png.toString('base64'), PAD],
  );
  await page.close();
  return Buffer.from(uri.split(',')[1], 'base64');
}

/**
 * No ink may fall where the card's corner curve cuts.
 *
 * The band is there for exactly this, and an asset that reintroduces the
 * clipping — a wider export, a bigger title, a smaller `PAD` — looks fine
 * everywhere except the two top corners of one card on the page. Checking it
 * here is the only place the two facts meet: the radius the card rounds at, and
 * the pixels the asset carries.
 */
async function assertCornersClear(browser, png, key) {
  const page = await browser.newPage();
  const worst = await page.evaluate(
    ([b64, share, ink]) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onerror = () => rej(new Error('decode failed'));
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(img, 0, 0);
          const r = Math.round(img.width * share);
          const px = x.getImageData(0, 0, img.width, r).data;
          const at = (col, row) => {
            const i = (row * img.width + col) * 4;
            return [px[i], px[i + 1], px[i + 2]];
          };
          const ground = at(2, 2);
          const off = (col, row) => at(col, row).some((v, i) => Math.abs(v - ground[i]) > ink);
          let deepest = 0;
          for (let row = 0; row < r; row += 1) {
            // How far the curve reaches in at this depth, on both sides.
            const reach = Math.ceil(r - Math.sqrt(Math.max(0, r * r - (r - row) ** 2)));
            for (let col = 0; col < reach; col += 1) {
              if (off(col, row) || off(img.width - 1 - col, row)) deepest = Math.max(deepest, row + 1);
            }
          }
          res(deepest);
        };
        img.src = 'data:image/png;base64,' + b64;
      }),
    [png.toString('base64'), PHONE_RADIUS, INK],
  );
  await page.close();
  if (worst) {
    throw new Error(
      `${key}: content sits ${worst}px into the card's corner curve and would be clipped — raise PAD`,
    );
  }
}

/** An encoded image's height once it is resampled to `width`. */
async function heightOf(browser, webp, width) {
  const page = await browser.newPage();
  const h = await page.evaluate(
    ([b64, w]) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onerror = () => rej(new Error('decode failed'));
        img.onload = () => res(Math.round((w * img.height) / img.width));
        img.src = 'data:image/webp;base64,' + b64;
      }),
    [webp.toString('base64'), width],
  );
  await page.close();
  return h;
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
