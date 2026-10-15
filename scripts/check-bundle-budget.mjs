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
 *   size of each image. Recognized AVIF/WebP pictures count the larger format
 *   total, so this is what the page can load, not what one visitor does.
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
import { basename, dirname, extname, join } from 'node:path';
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

/** Rolldown may merge a dynamic catalog into a shared chunk with no source key.
 * Resolve its emitted glob loader instead of dropping that startup download.
 * Require one destination, since guessing by chunk name could select UI copy.
 */
function manifestChunk(key) {
  if (manifest[key]) return manifest[key];
  const catalog = /^src\/i18n\/(names|picker-names)\/(.+)$/.exec(key);
  if (!catalog) return undefined;
  const [, directory, filename] = catalog;
  const loaderKeys = [
    JSON.stringify(`./${directory}/${filename}`),
    JSON.stringify(`../i18n/${directory}/${filename}`),
  ];
  const destinations = new Set();
  for (const chunk of Object.values(manifest)) {
    if (extname(chunk.file) !== '.js') continue;
    const code = readFileSync(join(dist, chunk.file), 'utf8');
    for (const loaderKey of loaderKeys) {
      let at = code.indexOf(loaderKey);
      while (at !== -1) {
        const loader = code.slice(at + loaderKey.length, at + loaderKey.length + 200);
        const match = loader.match(/^:\s*\(\)\s*=>[^;]{0,160}?import\((['"`])(\.\/[^'"`]+)\1\)/);
        if (match) destinations.add(join(dirname(chunk.file), match[2]));
        at = code.indexOf(loaderKey, at + loaderKey.length);
      }
    }
  }
  if (destinations.size !== 1) return undefined;
  const file = [...destinations][0];
  return Object.values(manifest).find((chunk) => chunk.file === file);
}

/** Every emitted file reachable through static imports from the given keys. */
function files(keys) {
  const seen = new Set();
  const out = { text: new Set(), images: new Set() };
  const visit = (key) => {
    if (seen.has(key)) return;
    const chunk = manifestChunk(key);
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

function pictureSavings(found, skip, keys) {
  const attributes = (input) => {
    const out = Object.create(null);
    let valid = true;
    const rest = input.replace(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, name, a, b) => {
      name = name.toLowerCase();
      if (Object.hasOwn(out, name)) valid = false;
      out[name] = a ?? b;
      return '';
    });
    return valid && !rest.replace(/\/\s*$/, '').trim() ? out : null;
  };
  const urls = (value) => typeof value === 'string' ? value.split(',').map(part =>
    /^\/?(assets\/[\w./-]+)(?:\s+(?:\d+w|\d+(?:\.\d+)?x))?$/.exec(part.trim())?.[1]) : [];
  const groups = new Map();
  const outside = [];
  for (const file of new Set([...found.text, ...keys.filter(key => extname(key) === '.html')])) {
    if (extname(file) === '.css') outside.push(readFileSync(join(dist, file), 'utf8'));
    if (extname(file) !== '.html') continue;
    outside.push(readFileSync(join(dist, file), 'utf8').replace(
      /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<picture\b[^>]*>[\s\S]*?<\/picture\s*>/gi,
      block => {
        const match = /^<picture\b([^>]*)>\s*<source\b([^>]*)>\s*<img\b([^>]*)>\s*<\/picture\s*>$/i.exec(block);
        if (!match) return block;
        const [picture, source, img] = match.slice(1).map(attributes);
        if (!picture || !source || !img || Object.keys(picture).some(k => k !== 'class')) return block;
        if (Object.keys(source).some(k => !['type', 'srcset'].includes(k)) || source.type !== 'image/avif') return block;
        if (Object.keys(img).some(k => !['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'class', 'loading', 'decoding', 'fetchpriority', 'draggable'].includes(k))) return block;
        const avif = [...new Set(urls(source.srcset))];
        const webp = [...new Set([...urls(img.src), ...urls(img.srcset)])];
        if (!avif.length || !webp.length || !/^\/?assets\/[\w./-]+\.webp$/.test(img.src ?? '')) return block;
        if (avif.some(f => !f?.endsWith('.avif')) || webp.some(f => !f?.endsWith('.webp'))) return block;
        const all = [...avif, ...webp];
        if (all.some(f => !found.images.has(f) || skip.images.has(f))) return block;
        groups.set(JSON.stringify([avif.slice().sort(), webp.slice().sort()]), { avif, webp, all });
        return '';
      },
    ));
  }
  const uses = outside.join('\n').replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<link\b([^>]*)>/gi, (tag, _, input) => {
    if (input === undefined) return tag;
    const a = attributes(input);
    if (!a || Object.keys(a).some(k => !['rel', 'as', 'type', 'href', 'fetchpriority'].includes(k))) return tag;
    if (a.rel !== 'preload' || a.as !== 'image' || a.type !== 'image/avif') return tag;
    const files = urls(a.href);
    return files.length === 1 && [...groups.values()].some(g => g.avif.includes(files[0])) ? '' : tag;
  });
  const candidates = [...groups.values()];
  let savings = 0;
  for (const group of candidates) {
    if (group.all.some(f => uses.includes(basename(f)))) continue;
    if (candidates.some(other => other !== group && other.all.some(f => group.all.includes(f)))) continue;
    const bytes = files => files.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0);
    savings += Math.min(bytes(group.avif), bytes(group.webp));
  }
  return savings;
}

function measure(keys, minus) {
  const found = files(keys);
  const skip = minus ?? { text: new Set(), images: new Set() };
  let text = 0;
  let images = 0;
  for (const f of found.text) if (!skip.text.has(f)) text += brotli(f);
  for (const f of found.images) if (!skip.images.has(f)) images += statSync(join(dist, f)).size;
  images -= pictureSavings(found, skip, keys);
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
