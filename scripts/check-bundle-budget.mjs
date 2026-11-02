#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateHomeArtwork } from './home-artwork/manifest.mjs';
import { brotliCompressSync, constants } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetsFile = join(root, 'scripts/performance/budgets.json');
const HEADROOM = 1.05;
const VERCEL_BROTLI_QUALITY = 11;
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
    params: { [constants.BROTLI_PARAM_QUALITY]: VERCEL_BROTLI_QUALITY },
  }).length;

// platform: Rolldown can merge a dynamic catalog into a shared chunk with no source key, so this resolves its emitted glob loader.
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

function attributes(input) {
    const out = Object.create(null);
    let valid = true;
    const rest = input.replace(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, name, a, b) => {
      name = name.toLowerCase();
      if (Object.hasOwn(out, name)) valid = false;
      out[name] = a ?? b;
      return '';
    });
    return valid && !rest.replace(/\/\s*$/, '').trim() ? out : null;
}

function pictureSavings(found, skip, keys) {
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

function imageFormatSavings(found, skip, groups = []) {
  const credited = new Set();
  let savings = 0;
  if (!Array.isArray(groups)) throw new Error('imageFormats must be an array');
  for (const group of groups) {
    if (!group || Object.keys(group).sort().join(',') !== 'avif,webp') throw new Error('Invalid imageFormats group');
    const totals = [];
    for (const format of ['avif', 'webp']) {
      if (!Array.isArray(group[format]) || !group[format].length) throw new Error(`Empty imageFormats ${format} group`);
      let total = 0;
      for (const source of group[format]) {
        const file = manifest[source]?.file;
        if (!file) throw new Error(`Image format asset missing from manifest: ${source}`);
        if (extname(source) !== `.${format}` || extname(file) !== `.${format}`) throw new Error(`Wrong image format: ${source}`);
        if (credited.has(file)) throw new Error(`Image format groups overlap: ${source}`);
        if (!found.images.has(file) || skip.images.has(file)) throw new Error(`Image format asset not counted on this page: ${source}`);
        credited.add(file);
        total += statSync(join(dist, file)).size;
      }
      totals.push(total);
    }
    savings += totals.reduce((sum, total) => sum + total, 0) - Math.max(...totals);
  }
  return { savings, files: credited };
}

function homepageArtwork(found, skip, keys) {
  const none = { savings: 0, files: new Set() };
  if (!keys.includes('index.html')) return none;
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  if (!html.includes('data-home-picture=')) return none;
  const fail = detail => { throw new Error('Homepage artwork resource contract: ' + detail); };
  const artwork = validateHomeArtwork(root);
  const media = '(max-width:480px) and (hover:none) and (pointer:coarse) and (any-hover:none) and (scripting:enabled)';
  const empty = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const pictures = new Map(), expectedPreloads = [], credited = new Set(), sets = [];
  let outside = html.replace(/<!--[^]*?-->|<script\b[^>]*>[^]*?<\/script\s*>/gi, '');
  outside = outside.replace(/<picture\b([^>]*)>([^]*?)<\/picture\s*>/gi, (block, input, body) => {
    const attrs = attributes(input);
    if (!attrs?.['data-home-picture']) return block;
    const id = attrs['data-home-picture'];
    if (Object.keys(attrs).some(key => !['class', 'data-home-picture'].includes(key))) fail('unexpected picture attribute ' + id);
    if (body.replace(/<(?:source|img)\b[^>]*>/gi, '').trim()) fail('unexpected picture contents ' + id);
    if (pictures.has(id)) fail('duplicate picture ' + id);
    const sources = [...body.matchAll(/<source\b([^>]*)>/gi)].map(match => attributes(match[1]));
    const images = [...body.matchAll(/<img\b([^>]*)>/gi)].map(match => attributes(match[1]));
    if (sources.some(source => !source) || images.length !== 1 || !images[0] || images[0].srcset) fail('malformed picture ' + id);
    const allowed = ['src', 'alt', 'width', 'height', 'class', 'loading', 'decoding', 'fetchpriority', 'draggable', 'data-baked-resource', 'data-card-scene', 'data-scene-slot'];
    if (Object.keys(images[0]).some(key => !allowed.includes(key))) fail('unexpected image attribute ' + id);
    pictures.set(id, { sources, img: images[0] });
    return '';
  });
  const same = (actual, expected) => actual && Object.keys(actual).sort().join() === Object.keys(expected).sort().join() && Object.entries(expected).every(([key, value]) => actual[key] === value);
  const expectPicture = (id, sources, src) => {
    const actual = pictures.get(id);
    if (!actual || actual.img.src !== src || actual.sources.length !== sources.length || sources.some((source, index) => !same(actual.sources[index], source))) fail('picture sources differ: ' + id);
    pictures.delete(id);
  };
  const desktop = { avif: [], webp: [] };
  const originals = { dex: ['tool-dex', 'tool-dex-b'], league: ['tool-league-b', 'tool-league'], favorites: ['tool-favorites-b', 'tool-favorites'] };
  for (const [key, names] of Object.entries(originals)) for (const [slot, name] of names.entries()) {
    const files = {};
    for (const format of ['avif', 'webp']) {
      const file = manifest['src/assets/home/' + name + '.' + format]?.file;
      if (!file || !found.images.has(file) || skip.images.has(file)) fail('original is not counted: ' + name + '.' + format);
      files[format] = file; desktop[format].push(file); credited.add(file);
    }
    expectPicture(key + '-' + slot, [{ media, srcset: empty }, { type: 'image/avif', srcset: '/' + files.avif }], '/' + files.webp);
    expectedPreloads.push({ rel: 'preload', as: 'image', type: 'image/avif', media: 'not all and ' + media, href: '/' + files.avif });
  }
  sets.push(desktop.avif, desktop.webp);
  const sceneSources = { favorites: [], dex: [], league: [] };
  artwork.poses.sort((a, b) => a.viewportWidth - b.viewportWidth).forEach((pose, index, poses) => {
    const lo = index ? (poses[index - 1].viewportWidth + pose.viewportWidth) / 2 + 0.001 : 0;
    const hi = index === poses.length - 1 ? 480 : (pose.viewportWidth + poses[index + 1].viewportWidth) / 2;
    const range = media + ' and (min-width:' + lo + 'px) and (max-width:' + hi + 'px)';
    const current = { avif: [], webp: [] };
    for (const card of pose.cards) for (const format of ['avif', 'webp']) {
      const asset = card[format], file = 'assets/home-mobile/' + asset.file;
      const bytes = readFileSync(join(dist, file));
      if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256 || skip.images.has(file) || credited.has(file)) fail('copied scene differs: ' + file);
      found.images.add(file); credited.add(file); current[format].push(file);
      sceneSources[card.key].push({ media: range, type: 'image/' + format, srcset: '/' + file });
      if (format === 'avif') expectedPreloads.push({ rel: 'preload', as: 'image', type: 'image/avif', media: range, href: '/' + file });
    }
    sets.push(current.avif, current.webp);
  });
  for (const key of Object.keys(sceneSources)) {
    for (const slot of [0, 1]) {
      const img = pictures.get(key + '-mobile-' + slot)?.img;
      if (img?.['data-card-scene'] !== key || img?.['data-scene-slot'] !== String(slot)) fail('scene slot identity differs: ' + key);
    }
    expectPicture(key + '-mobile-0', sceneSources[key], empty);
    expectPicture(key + '-mobile-1', [], empty);
  }
  if (pictures.size) fail('unknown pictures');
  outside = outside.replace(/<link\b([^>]*)>/gi, (tag, input) => {
    const attrs = attributes(input);
    if (!attrs || attrs.rel !== 'preload' || attrs.as !== 'image') return tag;
    const index = expectedPreloads.findIndex(expected => same(Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'fetchpriority')), expected));
    if (index === -1) fail('unexpected image preload');
    expectedPreloads.splice(index, 1); return '';
  });
  if (expectedPreloads.length) fail('missing image preloads');
  outside += [...found.text].filter(file => extname(file) === '.css').map(file => readFileSync(join(dist, file), 'utf8')).join('\n');
  if ([...credited].some(file => outside.includes(basename(file)))) fail('artwork independently requested outside its pictures');
  const totals = sets.map(files => files.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0));
  const total = [...credited].reduce((sum, file) => sum + statSync(join(dist, file)).size, 0);
  console.log('       hub      image alternatives: desktop AVIF/WebP ' + totals.slice(0, 2).join('/') + ' B; phone AVIF/WebP ' + totals.slice(2).join('/') + ' B; distribution ' + total + ' B');
  return { savings: total - Math.max(...totals), files: credited };
}

function measure(keys, minus, formats) {
  const found = files(keys);
  const skip = minus ?? { text: new Set(), images: new Set() };
  const homepage = homepageArtwork(found, skip, keys);
  const excluded = { ...skip, images: new Set([...skip.images, ...homepage.files]) };
  let text = 0;
  let images = 0;
  for (const f of found.text) if (!skip.text.has(f)) text += brotli(f);
  for (const f of found.images) if (!skip.images.has(f)) images += statSync(join(dist, f)).size;
  images -= homepage.savings;
  const alternative = imageFormatSavings(found, excluded, formats);
  images -= alternative.savings;
  images -= pictureSavings(found, { ...skip, images: new Set([...excluded.images, ...alternative.files]) }, keys);
  return { text, images, found };
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const pct = (now, base) => (base || !now ? `${now >= base ? '+' : ''}${(((now - base) / (base || 1)) * 100).toFixed(1)}%` : 'new');

const rebase = process.argv.includes('--rebase');
const failures = [];
console.log('Page first-load budget (Brotli text, raw images)');
for (const [page, spec] of Object.entries(budgets.pages)) {
  const first = measure([spec.html, ...spec.startup], undefined, spec.imageFormats);
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
