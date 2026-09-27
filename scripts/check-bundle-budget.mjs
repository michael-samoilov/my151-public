#!/usr/bin/env node
/**
 * Fails when a page's first-load download grows past its ceiling in
 * scripts/performance/budgets.json.
 *
 *   node scripts/check-bundle-budget.mjs            # build, measure, check
 *   node scripts/check-bundle-budget.mjs --dist d   # measure an existing build
 *                                                   # made with `--manifest`
 *
 * The script builds into a temporary directory with a Vite manifest, so the
 * deployed `dist/` stays unchanged. For each page it walks
 * the static import graph of the HTML entry plus the lazy modules the page
 * always loads at startup (`startup` in the budget file). It sums two numbers:
 *
 * - `text`: HTML, JavaScript, and CSS, compressed with Brotli quality 11, which
 *   is what Vercel sends.
 * - `images`: image files those modules import, as emitted. They are already
 *   compressed. Every `srcset` size counts, though a browser downloads one
 *   size of each image, so this is what the page can load, not what one
 *   visitor does.
 *
 * Fonts are not counted. The CSS names every Inter subset, but a browser
 * downloads only the subsets its text needs.
 *
 * Each number has a `baseline` (the last measured value) and a `ceiling`. A
 * value over its ceiling fails. The report prints every page, so drift below
 * the ceiling stays visible. `lazy` lists modules that load on first use; the
 * report prints them but never fails on them.
 *
 * After a change that shrinks a page, or a size increase that was agreed on,
 * run with `--rebase`. It writes each baseline as measured and each ceiling
 * 5% above it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetsFile = join(root, 'scripts/performance/budgets.json');
const HEADROOM = 1.05;
const IMAGE = new Set(['.avif', '.gif', '.jpg', '.jpeg', '.png', '.svg', '.webp']);

const distFlag = process.argv.indexOf('--dist');
let dist;
if (distFlag === -1) {
  dist = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
  process.on('exit', () => rmSync(dist, { recursive: true, force: true }));
  execFileSync('npx', ['vite', 'build', '--manifest', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: root,
    stdio: 'inherit',
  });
} else {
  dist = process.argv[distFlag + 1];
}

const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'));
const budgets = JSON.parse(readFileSync(budgetsFile, 'utf8'));

const brotli = (file) =>
  brotliCompressSync(readFileSync(join(dist, file)), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

/** Every emitted file reachable through static imports from the given keys. */
function files(keys) {
  const seen = new Set();
  const out = { text: new Set(), images: new Set() };
  const visit = (key) => {
    if (seen.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`${key} is not in the Vite manifest. Update scripts/performance/budgets.json.`);
    seen.add(key);
    out.text.add(chunk.file);
    for (const css of chunk.css ?? []) out.text.add(css);
    for (const asset of chunk.assets ?? []) if (IMAGE.has(extname(asset).toLowerCase())) out.images.add(asset);
    for (const next of chunk.imports ?? []) visit(next);
  };
  keys.forEach(visit);
  return out;
}

function measure(keys, minus) {
  const found = files(keys);
  const skip = minus ?? { text: new Set(), images: new Set() };
  let text = 0;
  let images = 0;
  for (const f of found.text) if (!skip.text.has(f)) text += brotli(f);
  for (const f of found.images) if (!skip.images.has(f)) images += statSync(join(dist, f)).size;
  return { text, images, found };
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const pct = (now, base) => (base || !now ? `${now >= base ? '+' : ''}${(((now - base) / (base || 1)) * 100).toFixed(1)}%` : 'new');

const rebase = process.argv.includes('--rebase');
const failures = [];
console.log('Page first-load budget (Brotli text, raw images)');
for (const [page, spec] of Object.entries(budgets.pages)) {
  const first = measure([spec.html, ...spec.startup]);
  for (const kind of ['text', 'images']) {
    const now = first[kind];
    if (rebase) spec[kind] = { baseline: now, ceiling: Math.ceil(now * HEADROOM) };
    const { baseline, ceiling } = spec[kind];
    const over = now > ceiling;
    if (over) failures.push(`${page} ${kind}: ${kib(now)} is over the ${kib(ceiling)} ceiling`);
    console.log(
      `  ${over ? 'FAIL' : 'ok  '} ${page.padEnd(8)} ${kind.padEnd(6)} ${kib(now).padStart(10)}  ` +
        `baseline ${kib(baseline)} (${pct(now, baseline)}), ceiling ${kib(ceiling)}`,
    );
  }
  for (const lazy of spec.lazy ?? []) {
    const cost = measure([lazy], first.found);
    console.log(`       ${page.padEnd(8)} on use ${kib(cost.text).padStart(10)}  ${lazy}`);
  }
}

if (rebase) {
  writeFileSync(budgetsFile, `${JSON.stringify(budgets, null, 2)}\n`);
  console.log(`\nWrote ${budgetsFile}`);
}

if (failures.length > 0) {
  console.error(`\nBundle budget failed:\n${failures.map((f) => `- ${f}`).join('\n')}`);
  console.error(
    'Find what grew, and keep it off the first load if the page does not need it at once. ' +
      'If the growth is intended, run `node scripts/check-bundle-budget.mjs --rebase` and give the reason in the commit.',
  );
  process.exit(1);
}
