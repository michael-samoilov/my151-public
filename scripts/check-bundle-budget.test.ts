import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgets = JSON.parse(readFileSync(join(root, 'scripts/performance/budgets.json'), 'utf8'));
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

function run(html: string, sizes: Record<string, number> = { 'preview.avif': 449939, 'preview.webp': 739180 }, css = '') {
  const dist = mkdtempSync(join(root, '.budget-fixture-'));
  directories.push(dist);
  mkdirSync(join(dist, '.vite'));
  mkdirSync(join(dist, 'assets'));
  const manifest: Record<string, object> = {};
  for (const spec of Object.values(budgets.pages) as { html: string; startup: string[]; lazy?: string[]; imageFormats?: { avif: string[]; webp: string[] }[] }[]) {
    writeFileSync(join(dist, spec.html), spec.html === 'index.html' ? html : '<html></html>');
    const entry = `assets/${spec.html}.js`;
    writeFileSync(join(dist, entry), '');
    // This fixture exercises hub pictures. Represent other pages' declared
    // format groups with zero-byte assets so their graph remains valid.
    const assets: string[] = [];
    for (const group of spec.imageFormats ?? []) for (const key of [...group.avif, ...group.webp]) {
      const file = `assets/${basename(key)}`;
      assets.push(file);
      writeFileSync(join(dist, file), '');
      manifest[key] = { file };
    }
    manifest[spec.html] = { file: entry, assets };
    for (const key of [...spec.startup, ...spec.lazy ?? []]) manifest[key] = { file: 'assets/empty.js' };
  }
  writeFileSync(join(dist, 'assets/empty.js'), '');
  writeFileSync(join(dist, 'assets/style.css'), css);
  manifest['src/components/home/HomePage.tsx'] = {
    file: 'assets/empty.js', css: ['assets/style.css'], assets: Object.keys(sizes).map(name => `assets/${name}`),
  };
  for (const [file, size] of Object.entries(sizes)) writeFileSync(join(dist, 'assets', file), Buffer.alloc(size));
  writeFileSync(join(dist, '.vite/manifest.json'), JSON.stringify(manifest));
  const result = spawnSync(process.execPath, [join(root, 'scripts/check-bundle-budget.mjs'), '--dist', dist], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

const picture = '<picture class="contents"><source type="image/avif" srcSet="/assets/preview.avif"/><img src="/assets/preview.webp" width="800" height="1000" alt="Preview"/></picture>';

test('accepts mutually exclusive formats under the real existing image ceiling', () => {
  const result = run('<link rel="preload" as="image" type="image/avif" href="/assets/preview.avif"/>' + picture);
  expect(result.output).toContain('hub');
  expect(result.status, result.output).toBe(0);
});

test('rejects a fallback image that alone exceeds the ceiling', () => {
  const result = run(picture, { 'preview.avif': 449939, 'preview.webp': budgets.pages.hub.images.ceiling + 1 });
  expect(result.status).toBe(1);
  expect(result.output).toContain('hub images');
});

test.each([
  '<img src="/assets/preview.avif"/>',
  '<link rel="preload" as="image" href="/assets/preview.avif"/>',
  '<link rel="preload" as="image" type="image/webp" href="/assets/preview.avif"/>',
  '<link rel="preload" as="image" type="image/webp" href="/assets/preview.webp"/>',
])('rejects format assets independently requested outside their picture: %s', outside => {
  expect(run(picture + outside).status).toBe(1);
});

test.each(['/assets/preview.avif', 'preview.avif'])('retains independently requested CSS images in the budget: %s', url => {
  expect(run(picture, undefined, `body{background-image:url(${url})}`).status).toBe(1);
});

test.each([
  picture.replace('type="image/avif"', 'type="image/avif" media="(min-width: 500px)"'),
  picture.replace('<img ', '<source type="image/webp" srcset="/assets/preview.webp"/><img '),
  picture.replace('</picture>', ''),
  picture.replace('srcSet="/assets/preview.avif"', 'srcSet="/assets/preview.avif" srcset="/assets/preview.webp"'),
])('keeps conservative accounting for unsupported or malformed picture structures: %s', html => {
  expect(run(html).status).toBe(1);
});

test('sums every responsive size within the selected format', () => {
  const html = picture.replace('src="/assets/preview.webp"', 'src="/assets/preview.webp" srcset="/assets/preview.webp 1x, /assets/preview-2x.webp 2x"');
  expect(run(html, { 'preview.avif': 10000, 'preview.webp': 400000, 'preview-2x.webp': 400000 }).status).toBe(1);
});

test('retains unrelated manifest assets even when their markup is dynamic', () => {
  expect(run(picture, { 'preview.avif': 449939, 'preview.webp': 739180, 'dynamic.png': 50000 }).status).toBe(1);
});

test('does not subtract the same format asset twice when pictures repeat', () => {
  expect(run(picture + picture, { 'preview.avif': 449939, 'preview.webp': 800000 }).status).toBe(1);
});
