/**
 * Width sweep for the poster home page.
 *
 * The three artboards are three points on a curve. This drives the same
 * generator across the widths between and beyond them, renders each one in
 * Chromium, and asserts the layout invariants from the DOM. A width that
 * overlaps, clips, or hangs fails here instead of on a phone.
 *
 * usage: node sweep.mjs [--keep] [--only <w>]
 */
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poster, posterConfig } from './build-artboards.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CANVAS = join(HERE, 'canvas');
const WORK = join(CANVAS, '__sweep');
const CHROMIUM = '/opt/pw-browsers/chromium';
// The artboards pull Inter from Google Fonts, which this sandbox cannot reach.
// The app ships the same face, so the sweep serves it from the repo: the sweep
// then measures the metrics the real page has, offline, with no load wait.
const INTER = join(
  HERE,
  '../../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
);
const FONT_FACE =
  "<style>@font-face{font-family:'Inter';src:url('__sweep/inter.woff2') format('woff2');" +
  'font-weight:100 900;font-style:normal;font-display:block}</style>';

/** A plausible viewport height for a width, so the sweep frames are realistic. */
const heightFor = (w) =>
  w < 600 ? Math.round(w * 2.1) : w < 1024 ? Math.round(w * 1.33) : Math.round(w * 0.625);

const WIDTHS = [
  320, 344, 360, 375, 390, 412, 414, 428, 480, 540, 568, 600, 667, 700, 768, 800,
  834, 900, 960, 1000, 1023, 1024, 1080, 1112, 1180, 1280, 1366, 1440, 1512,
  1600, 1728, 1920, 2560,
];

/** Height stress at the three reviewed widths: short and tall frames. */
const HEIGHT_CASES = [
  [390, 667], [390, 844], [390, 932], [390, 1000],
  [834, 1024], [834, 1112], [834, 1194], [834, 1366],
  [1024, 640], [1280, 720], [1440, 780], [1440, 900], [1440, 1080], [1920, 1080],
];

const cases = [
  ...WIDTHS.map((w) => [w, heightFor(w)]),
  ...HEIGHT_CASES,
].filter(([w, h], i, a) => a.findIndex(([x, y]) => x === w && y === h) === i);

const only = process.argv.includes('--only')
  ? Number(process.argv[process.argv.indexOf('--only') + 1])
  : null;

/**
 * Mutation testing for the probe itself. Each entry injects one known defect
 * into the rendered page and names the check that has to catch it. A sweep that
 * cannot fail is not evidence, so `--mutate all` is the proof that it can.
 */
const MUTATIONS = {
  wide: {
    catches: 'leaves only',
    apply: (html) => html.replace(/width: (\d+)px; transform: rotate/g, (m, w) => `width: ${Math.round(+w * 1.4)}px; transform: rotate`),
  },
  packed: {
    catches: 'overlap',
    apply: (html) => html.replace(/row-gap: \d+px/, 'row-gap: 0px'),
  },
  bigtitle: {
    catches: 'title wrapped',
    apply: (html) => html.replace(/white-space: nowrap; color: #ffffff/g, 'color: #ffffff; font-size: 30px'),
  },
  clipblurb: {
    catches: 'blurb clipped',
    apply: (html) => html.replace(/height: (\d+)px; font-size: ([\d.]+)px; line-height: 1.35/g, 'height: 8px; font-size: $2px; line-height: 1.35; overflow: hidden'),
  },
  widehero: {
    catches: 'hero text 0 outside frame',
    apply: (html) => html.replace(/(<h1 style="margin: 0; max-width: )\d+px/, '$14000px; width: 4000px'),
  },
  showfooter: {
    catches: 'above the',
    apply: (html) => html.replace(/min-height: (\d+)px; display: flex/, 'min-height: 0px; display: flex'),
  },
  shortmark: {
    catches: 'mark air',
    apply: (html) => html.replace(/(display: flex; align-items: center; justify-content: center;">)/, 'display: flex; align-items: flex-start; justify-content: center;">'),
  },
};

const mutate = process.argv.includes('--mutate')
  ? process.argv[process.argv.indexOf('--mutate') + 1]
  : null;

// The probe runs in the page. It reads geometry, never text, so copy edits
// never break it. Every failure carries the numbers that produced it.
const PROBE = `
addEventListener('load', () => setTimeout(() => {
  const fail = [];
  const info = [];
  const R = (e) => e.getBoundingClientRect();
  const near = (a, b) => Math.abs(a - b) < 0.75;
  const root = document.body.firstElementChild;
  const grid = [...root.querySelectorAll('div')].find((e) => getComputedStyle(e).display === 'grid');
  const cards = [...grid.children];
  const fold = root.firstElementChild;
  const footer = root.lastElementChild;
  const hero = root.querySelector('section');
  const frame = R(root);

  // 1. The page may grow downward and scroll. It may never scroll sideways.
  if (root.scrollWidth - root.clientWidth > 0.5) fail.push('h-overflow ' + root.scrollWidth + ' > ' + root.clientWidth);

  // 2. The footer starts below the fold. What a visitor sees before scrolling
  // is the header, the hero and the grid — never the footer, at any width.
  if (R(footer).top < FRAME_H - 0.5) {
    fail.push('footer top at ' + R(footer).top.toFixed(1) + ', above the ' + FRAME_H + 'px fold');
  }

  // 3. Bands stay in order and never overlap: hero, grid, footer.
  if (R(hero).bottom - R(grid).top > 0.5) fail.push('hero overlaps grid by ' + (R(hero).bottom - R(grid).top).toFixed(1));
  if (R(grid).bottom - R(footer).top > 0.5) fail.push('grid overlaps footer by ' + (R(grid).bottom - R(footer).top).toFixed(1));

  // 3. No two cards touch.
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = R(cards[i]), b = R(cards[j]);
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 0.5 && oy > 0.5) fail.push('cards ' + i + '/' + j + ' overlap ' + ox.toFixed(1) + 'x' + oy.toFixed(1));
    }
  }

  cards.forEach((card, i) => {
    const c = R(card);
    const h2 = card.querySelector('h2');
    const p = card.querySelector('h2 + p');

    // 4. Each heading stays on one line and inside its card.
    // A block element always reports one client rect, so line count has to come
    // from the text range, not the element.
    const range = document.createRange();
    range.selectNodeContents(h2);
    const text = range.getBoundingClientRect().width;
    const lines = range.getClientRects().length;
    if (text - R(h2).width > 0.5) fail.push('card ' + i + ' title overruns by ' + (text - R(h2).width).toFixed(1));
    if (lines > 1) fail.push('card ' + i + ' title wrapped to ' + lines + ' lines');

    // 5. The blurb fits its fixed band.
    if (p.scrollHeight - p.clientHeight > 0.5) fail.push('card ' + i + ' blurb clipped by ' + (p.scrollHeight - p.clientHeight));

    // 6. Artwork never reaches the card's right edge: a bare strip must remain.
    // Corners are rotated, so read the transformed box, not the layout box.
    [...card.querySelectorAll('img')].forEach((img, k) => {
      const r = R(img);
      const strip = c.right - r.right;
      if (strip < c.width * 0.08) fail.push('card ' + i + ' shot ' + k + ' leaves only ' + strip.toFixed(1) + 'px of strip (need ' + (c.width * 0.08).toFixed(1) + ')');
      // Artwork rises above the card, so it may not reach the band above it.
      if (r.top < frame.top) fail.push('card ' + i + ' shot ' + k + ' above the frame by ' + (frame.top - r.top).toFixed(1));
    });

    // 7. Artwork must not land on the card above it.
    [...card.querySelectorAll('img')].forEach((img, k) => {
      cards.forEach((other, j) => {
        if (other === card) return;
        const o = R(other);
        const r = R(img);
        if (o.bottom <= c.top + 0.5) {
          const ox = Math.min(o.right, r.right) - Math.max(o.left, r.left);
          const oy = Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top);
          if (ox > 0.5 && oy > 0.5) fail.push('card ' + i + ' shot ' + k + ' lands on card ' + j + ' by ' + ox.toFixed(1) + 'x' + oy.toFixed(1));
        }
      });
    });

    // 8. The placeholder mark stays wholly inside its own card.
    const svg = card.querySelector('svg');
    if (svg) {
      const s = R(svg);
      if (s.top < c.top - 0.5 || s.bottom > c.bottom + 0.5 || s.left < c.left - 0.5 || s.right > c.right + 0.5) {
        fail.push('card ' + i + ' mark escapes its card');
      }
      // Equal air above the mark and below it, up to the heading.
      const above = s.top - c.top;
      const below = R(h2).top - s.bottom;
      if (Math.abs(above - below) > 2) fail.push('card ' + i + ' mark air ' + above.toFixed(1) + ' above vs ' + below.toFixed(1) + ' below');
    }

    // 9. Copy stays inside the card on both sides.
    if (R(h2).left < c.left - 0.5 || R(h2).right > c.right + 0.5) fail.push('card ' + i + ' title outside card');
    if (R(p).bottom > c.bottom + 0.5) fail.push('card ' + i + ' blurb past card bottom');
  });

  // 10. Hero copy stays inside the frame and breaks rather than overrunning.
  // Height is not the test here: an h1 has no fixed height and no overflow, so
  // its scrollHeight runs a few px past clientHeight on ascenders alone.
  [...hero.querySelectorAll('h1, p')].forEach((e, i) => {
    const r = R(e);
    if (r.left < frame.left - 0.5 || r.right > frame.right + 0.5) fail.push('hero text ' + i + ' outside frame');
    if (e.scrollWidth - e.clientWidth > 0.5) fail.push('hero text ' + i + ' overruns its measure by ' + (e.scrollWidth - e.clientWidth));
  });

  // 11. The page is allowed to grow past the viewport and scroll; it is not
  // allowed to hide content. Report the overrun so the sweep can name a floor.
  // FRAME_H is the viewport the fold is designed for. The render window is
  // taller on purpose, so window.innerHeight is not the number to compare to.
  // The footer sits below the fold by design, so this measures the fold alone.
  const need = Math.ceil(R(fold).height);
  if (need > FRAME_H) info.push('fold needs ' + need + 'px in a ' + FRAME_H + 'px viewport (over by ' + (need - FRAME_H) + ')');

  const out = JSON.stringify({ fail, info });
  document.title = 'SWEEP' + out + 'END';
  document.getElementById('probe').textContent = 'SWEEP' + out + 'END';
}, 500));
`;

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
copyFileSync(INTER, join(WORK, 'inter.woff2'));

/** Render one frame and return { problems, info }. */
function drive(w, h, mutation, shot) {
  const label = `${w}x${h}${mutation ? `-${mutation}` : ''}`;
  let html;
  try {
    html = poster(posterConfig(w, h));
  } catch (err) {
    return { label, stage: 'build', problems: [err.message], info: [] };
  }
  if (mutation) html = MUTATIONS[mutation].apply(html);
  const helmet = (html.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
  const board = html.replace(/[\s\S]*<\/helmet>/, '').replace(/<\/x-dc>[\s\S]*/, '');
  // Rendered from a dir inside canvas/, so the screenshots resolve through ../.
  // Inter comes from the repo; the Google Fonts link would hang offline.
  const head = helmet.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, FONT_FACE);
  const page = join(WORK, `${label}.html`);
  writeFileSync(
    page,
    `<!doctype html><html><head><meta charset="utf-8"><base href="../">${head}</head>` +
      `<body style="margin:0">${board}<pre id="probe" hidden></pre>` +
      `<script>const FRAME_H=${h};${PROBE}</script></body></html>`,
  );
  const dom = execFileSync(
    CHROMIUM,
    ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      `--window-size=${Math.max(w, 400)},${h + 120}`, '--virtual-time-budget=6000',
      shot ? `--screenshot=${shot}` : '--dump-dom', page],
    { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] },
  ).toString();
  if (shot) return { label, stage: 'shot', problems: [], info: [] };
  const m = dom.match(/SWEEP(.*?)END/);
  if (!m) return { label, stage: 'probe', problems: ['probe did not run'], info: [] };
  const { fail, info } = JSON.parse(m[1]);
  return { label, stage: 'layout', problems: fail, info };
}

let code = 0;

if (process.argv.includes('--shots')) {
  // Visual evidence for the widths a reviewer cannot see in the three
  // artboards, the breakpoint pair above all.
  const dir = process.argv[process.argv.indexOf('--shots') + 1];
  mkdirSync(dir, { recursive: true });
  for (const [w, h] of [[320, 672], [375, 667], [600, 798], [768, 1024], [1023, 1300], [1024, 700], [1180, 820], [1920, 1080]]) {
    drive(w, h, null, join(dir, `w${w}x${h}.png`));
    console.log('shot', w, h);
  }
} else if (process.argv.includes('--floor')) {
  // Rendered into a 1px frame, the flex spacers collapse and the root reports
  // its intrinsic height: the shortest viewport that shows the whole page
  // without scrolling.
  console.log('shortest viewport that fits the page in one screen\n');
  for (const w of [320, 360, 390, 414, 428, 768, 834, 900, 1023, 1024, 1280, 1440, 1920]) {
    const r = drive(w, 1, null);
    const need = (r.info[0] || '').match(/needs (\d+)px/);
    console.log(`  ${String(w).padStart(4)}px wide → ${need ? need[1] : '?'}px tall${r.problems.length ? '  [' + r.problems.join('; ') + ']' : ''}`);
  }
} else if (mutate) {
  // One stacked frame and one split frame, so a mutation that only bites in one
  // regime still has to be caught somewhere.
  const names = mutate === 'all' ? Object.keys(MUTATIONS) : [mutate];
  console.log('mutation test — each defect must be caught by its named check\n');
  for (const name of names) {
    const { catches } = MUTATIONS[name];
    const hits = [390, 1440].map((w) => {
      const r = drive(w, heightFor(w), name);
      return { w, caught: r.problems.some((p) => p.includes(catches)), problems: r.problems };
    });
    const caught = hits.some((x) => x.caught);
    if (!caught) code = 1;
    console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${name.padEnd(10)} → "${catches}"`);
    if (!caught) for (const x of hits) console.log(`    ${x.w}: ${x.problems.join(' | ') || '(no problems reported)'}`);
  }
  const clean = [390, 1440].map((w) => drive(w, heightFor(w), null));
  const dirty = clean.filter((r) => r.problems.length);
  if (dirty.length) {
    code = 1;
    console.log('\nCONTROL FAILED — the unmutated page must be clean');
    for (const r of dirty) console.log(`  ${r.label}: ${r.problems.join(' | ')}`);
  } else {
    console.log('\nCONTROL clean — 390 and 1440 pass unmutated');
  }
} else {
  let built = 0;
  let passed = 0;
  const failures = [];
  const notes = [];
  for (const [w, h] of cases) {
    if (only && w !== only) continue;
    const r = drive(w, h, null);
    built += 1;
    if (r.info.length) notes.push(r);
    if (r.problems.length) failures.push(r);
    else passed += 1;
  }
  console.log(`swept ${built} frames · ${passed} clean · ${failures.length} with problems`);
  for (const f of failures) {
    console.log(`\n${f.label} [${f.stage}]`);
    for (const p of f.problems) console.log(`  · ${p}`);
  }
  if (notes.length) {
    console.log(`\nfold taller than its viewport, so the page scrolls into the fold (${notes.length}):`);
    for (const n of notes) console.log(`  ${n.label} — ${n.info.join('; ')}`);
  }
  code = failures.length ? 1 : 0;
}

if (!process.argv.includes('--keep')) rmSync(WORK, { recursive: true, force: true });
process.exit(code);
