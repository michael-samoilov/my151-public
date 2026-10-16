import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';
import { changedPaths, parseOptions, select } from './policy';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'ci-policy-'));
  temporary.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'ci@example.test');
  git('config', 'user.name', 'CI gate');
  mkdirSync(join(root, 'src/favorites'), { recursive: true });
  writeFileSync(join(root, 'src/favorites/original.ts'), 'original\n');
  git('add', '.');
  git('commit', '-qm', 'baseline');
  return { root, git };
}

test('unusable history escalates rather than skipping browser coverage', () => {
  expect(select('affected', [], null, 'base unavailable').effectiveMode).toBe('full');
});

test('unknown, shared, API, saved-data, and dependency changes cannot take the fast route', () => {
  for (const path of ['src/new-tool.ts', 'src/lib/utils.ts', 'api/auth.ts', 'src/favorites/store/useFavoritesStore.ts', 'package-lock.json', 'scripts/ci/run.ts']) {
    const plan = select('affected', [path], 'abc');
    expect(plan.effectiveMode, path).toBe('full');
    expect(plan.reasons.join(' '), path).toContain(path);
  }
});

test('owned tool changes select complete spec families alongside smoke', () => {
  const plan = select('affected', ['src/favorites/FavoritesApp.tsx', 'src/league/main.tsx'], 'abc');
  expect(plan.effectiveMode).toBe('affected');
  const filter = new RegExp(plan.suitePattern);
  expect(filter.test('e2e/favorites-export.spec.ts test')).toBe(true);
  expect(filter.test('e2e/league-powerups.spec.ts test')).toBe(true);
  expect(filter.test('e2e/wordmark-home.spec.ts test @ci-smoke')).toBe(true);
  expect(filter.test('e2e/admin-picker-page.spec.ts ordinary test')).toBe(false);
});

test('only an explicit known documentation diff skips code checks; clean input still runs smoke', () => {
  expect(select('affected', ['docs/handoff/example.md', 'README.md'], 'abc').effectiveMode).toBe('docs');
  expect(select('affected', ['src/README.md'], 'abc').effectiveMode).toBe('full');
  expect(select('affected', [], 'abc').effectiveMode).toBe('fast');
});

test('Git collection includes commits, renames, deletions, dirty changes and untracked filenames with whitespace', () => {
  const { root, git } = repository();
  const base = git('rev-parse', 'HEAD');
  renameSync(join(root, 'src/favorites/original.ts'), join(root, 'src/favorites/renamed.ts'));
  git('add', '-A');
  git('commit', '-qm', 'rename');
  writeFileSync(join(root, 'src/favorites/new\nfile.ts'), 'untracked');
  writeFileSync(join(root, 'src/favorites/renamed.ts'), 'dirty');
  const paths = changedPaths(root, base).paths;
  expect(paths).toContain('src/favorites/original.ts');
  expect(paths).toContain('src/favorites/renamed.ts');
  expect(paths).toContain('src/favorites/new\nfile.ts');
  rmSync(join(root, 'src/favorites/renamed.ts'));
  expect(changedPaths(root, base).paths).toContain('src/favorites/renamed.ts');
  expect(changedPaths(root, '--not-a-ref').baseSha).toBeNull();
});

test('invalid CLI modes, missing option values and unknown flags fail at the boundary', () => {
  for (const args of [['quick'], ['fast', '--base'], ['fast', '--surprise']]) expect(() => parseOptions(args)).toThrow();
  expect(parseOptions(['affected', '--base', '--strange-ref', '--plan'])).toEqual({ mode: 'affected', base: '--strange-ref', plan: true });
});

test('viewport filtering intersects smoke instead of overriding it', async () => {
  const { projectFilter } = await import('./policy');
  const mobile = projectFilter('@ci-smoke', true);
  expect(mobile.test('desktop ordinary @ci-smoke')).toBe(false);
  expect(mobile.test('mobile viewport-only @viewport')).toBe(false);
  expect(mobile.test('mobile critical @viewport @ci-smoke')).toBe(true);
  expect(() => projectFilter('', false)).toThrow(/empty/i);
});


test('cross-tool models, exports, and reused components expand to full coverage', () => {
  for (const path of ['src/favorites/components/FavoritesGrid.tsx', 'src/favorites/model/catalog.ts', 'src/favorites/export/snapshot.ts', 'src/league/theme.ts', 'src/league/components/ExportPreview3D.tsx', 'src/league/model/engine.ts', 'src/league/LeagueApp.tsx', 'src/components/view/ViewPage.tsx']) {
    expect(select('affected', [path], 'abc').effectiveMode, path).toBe('full');
  }
});

test('staged changes remain visible when the worktree reverses them', () => {
  const { root, git } = repository();
  const path = join(root, 'src/favorites/original.ts');
  writeFileSync(path, 'staged change');
  git('add', '.');
  writeFileSync(path, 'original\n');
  expect(changedPaths(root, 'HEAD').paths).toContain('src/favorites/original.ts');
});


test('ordinary Dex, League, and Picker component changes retain affected coverage', () => {
  for (const path of ['src/components/pokedex/PokedexGrid.tsx', 'src/league/components/CardHelp.tsx', 'src/favorites/components/FavoritesHeader.tsx']) {
    expect(select('affected', [path], 'abc').effectiveMode, path).toBe('affected');
  }
});

test('ignored local build environment files cannot silently bypass affected selection', () => {
  const { root } = repository();
  writeFileSync(join(root, '.git/info/exclude'), '.env*\n');
  writeFileSync(join(root, '.env.production.local'), 'VITE_EXAMPLE=value');
  const changes = changedPaths(root, 'HEAD');
  expect(changes.paths).toContain('.env.production.local');
  expect(select('affected', changes.paths, changes.baseSha).effectiveMode).toBe('full');
});
