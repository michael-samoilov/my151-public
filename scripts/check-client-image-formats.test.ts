import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const work: string[] = [];
afterEach(() => { for (const p of work.splice(0)) rmSync(p, { recursive: true, force: true }); });
const group = { avif: ['src/shot.avif'], webp: ['src/shot.webp'] };

function check(groups: typeof group[], outsideBytes = 50) {
  const root = mkdtempSync(join(tmpdir(), 'format-budget-test-'));
  work.push(root);
  const dist = join(root, 'dist');
  for (const p of ['scripts/performance', 'dist/.vite', 'dist/assets']) mkdirSync(join(root, p), { recursive: true });
  writeFileSync(join(root, 'scripts/check-bundle-budget.mjs'), readFileSync(new URL('./check-bundle-budget.mjs', import.meta.url)));
  writeFileSync(join(root, 'scripts/performance/budgets.json'), JSON.stringify({ pages: { page: {
    html: 'index.html', startup: [], imageFormats: groups,
    text: { baseline: 100, ceiling: 1000 }, images: { baseline: 150, ceiling: 158 },
  } } }));
  const assets = ['assets/shot.avif', 'assets/shot.webp', 'assets/outside.png'];
  writeFileSync(join(dist, 'index.html'), '<main>Same page</main>');
  writeFileSync(join(dist, 'assets/page.js'), 'export const page=1;');
  for (const [name, bytes] of [[assets[0], 80], [assets[1], 100], [assets[2], outsideBytes]] as const) writeFileSync(join(dist, name), Buffer.alloc(bytes));
  writeFileSync(join(dist, '.vite/manifest.json'), JSON.stringify({
    'index.html': { file: 'assets/page.js', assets },
    'src/shot.avif': { file: assets[0] }, 'src/shot.webp': { file: assets[1] },
    'src/unreachable.avif': { file: 'assets/unreachable.avif' },
  }));
  return spawnSync(process.execPath, [join(root, 'scripts/check-bundle-budget.mjs'), '--dist', dist], { encoding: 'utf8' });
}

it('charges the larger client-rendered image format and every unrelated image', () => {
  const result = check([group]);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});

it('does not discount growth in images outside the declared format group', () => {
  const result = check([group], 90);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('images');
  expect(result.stderr).toContain('over');
});

it('rejects overlapping format declarations instead of crediting an asset twice', () => {
  const result = check([group, group]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('overlap');
});

it('rejects a format member absent from the manifest', () => {
  const result = check([{ avif: ['src/missing.avif'], webp: group.webp }]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('missing');
});

it('rejects a format member outside the measured page graph', () => {
  const result = check([{ avif: ['src/unreachable.avif'], webp: group.webp }]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('not counted');
});
