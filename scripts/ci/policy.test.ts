import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';
import { BROWSER_BUDGET_MS, changedPaths, parseOptions, select } from './policy';
import type { TestMap } from './testMap';

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
  expect(parseOptions(['affected', '--base', '--strange-ref', '--plan'])).toEqual({ mode: 'affected', base: '--strange-ref', plan: true, recordMap: false });
  expect(parseOptions(['full', '--record-map']).recordMap).toBe(true);
});

test('viewport filtering intersects smoke instead of overriding it', async () => {
  const { projectFilter } = await import('./policy');
  const mobile = projectFilter('@ci-smoke', true);
  expect(mobile.test('desktop ordinary @ci-smoke')).toBe(false);
  expect(mobile.test('mobile viewport-only @viewport')).toBe(false);
  expect(mobile.test('mobile critical @viewport @ci-smoke')).toBe(true);
  expect(() => projectFilter('', false)).toThrow(/empty/i);
});


test('staged changes remain visible when the worktree reverses them', () => {
  const { root, git } = repository();
  const path = join(root, 'src/favorites/original.ts');
  writeFileSync(path, 'staged change');
  git('add', '.');
  writeFileSync(path, 'original\n');
  expect(changedPaths(root, 'HEAD').paths).toContain('src/favorites/original.ts');
});


test('ignored local build environment files cannot silently bypass affected selection', () => {
  const { root } = repository();
  writeFileSync(join(root, '.git/info/exclude'), '.env*\n');
  writeFileSync(join(root, '.env.production.local'), 'VITE_EXAMPLE=value');
  const changes = changedPaths(root, 'HEAD');
  expect(changes.paths).toContain('.env.production.local');
  expect(select('affected', changes.paths, changes.baseSha, undefined, { map }).reasons.join(' ')).toContain('.env.production.local');
});

const map: TestMap = {
  version: 1,
  sourceCommit: 'abc',
  recordedAt: '2026-11-08T00:00:00.000Z',
  specs: {
    'e2e/hub-prerender.spec.ts': { ms: 20_000, tests: 12, unmapped: true },
    'e2e/sweeps/home-sweep.spec.ts': { ms: 40_000, tests: 22, unmapped: false },
    'e2e/league-card-slots.spec.ts': { ms: 110_000, tests: 30, unmapped: false },
    'e2e/admin-flows.spec.ts': { ms: 66_000, tests: 17, unmapped: false },
    'e2e/favorites-picker.spec.ts': { ms: BROWSER_BUDGET_MS * 3, tests: 80, unmapped: false },
  },
  sources: {
    'src/components/home/HomePage.tsx': ['e2e/sweeps/home-sweep.spec.ts'],
    'src/league/LeagueApp.tsx': ['e2e/league-card-slots.spec.ts'],
    'src/lib/utils.ts': ['e2e/admin-flows.spec.ts', 'e2e/favorites-picker.spec.ts', 'e2e/league-card-slots.spec.ts', 'e2e/sweeps/home-sweep.spec.ts'],
  },
};

test('an app file selects the specs that ran it and the specs that run no browser code, never other areas', () => {
  const plan = select('affected', ['src/components/home/HomePage.tsx'], 'abc', undefined, { map });
  expect(plan.effectiveMode).toBe('affected');
  const filter = new RegExp(plan.suitePattern);
  expect(filter.test('desktop sweeps/home-sweep.spec.ts sweeps the hub')).toBe(true);
  expect(filter.test('desktop hub-prerender.spec.ts holds the page')).toBe(true);
  expect(filter.test('desktop wordmark-home.spec.ts reaches the hub @ci-smoke')).toBe(true);
  expect(filter.test('desktop admin-flows.spec.ts funnels')).toBe(false);
  expect(filter.test('desktop league-card-slots.spec.ts seats')).toBe(false);
  expect(plan.estimateMs).toBe(30_000);
});

test('a change that no browser test runs keeps the cheap gates and smoke, and never escalates to full', () => {
  for (const path of ['scripts/eslint/writtenRules.mjs', 'scripts/ci/run.ts', 'api/auth.ts', '.claude/settings.json', 'src/favorites/model/catalog.test.ts', 'docs/i18n/sources/pokemon-formnames.json']) {
    expect(select('affected', [path], 'abc', undefined, { map }), path).toMatchObject({ effectiveMode: 'fast', suitePattern: '@ci-smoke' });
  }
});

test('an app input with no recorded test, a build script, and a dependency change defer to the release checks instead of the full suite', () => {
  for (const path of ['src/index.css', 'src/assets/home/mobile/manifest.json', 'package-lock.json', 'scripts/prerender-hub.ts']) {
    const plan = select('affected', [path], 'abc', undefined, { map, buildScripts: new Set(['scripts/prerender-hub.ts']) });
    expect(plan.effectiveMode, path).not.toBe('full');
    expect(plan.reasons.join(' '), path).toContain(`${path}; the release smoke and the post-release full run`);
  }
});

test('a selection over the browser budget runs the cheapest spec for each changed file and names the full run', () => {
  const plan = select('affected', ['src/lib/utils.ts', 'src/league/LeagueApp.tsx'], 'abc', undefined, { map });
  expect(plan.effectiveMode).toBe('affected');
  const filter = new RegExp(plan.suitePattern);
  expect(filter.test('desktop league-card-slots.spec.ts seats')).toBe(true);
  expect(filter.test('desktop favorites-picker.spec.ts picks')).toBe(false);
  expect(filter.test('desktop hub-prerender.spec.ts holds the page')).toBe(true);
  expect(plan.estimateMs).toBeLessThanOrEqual(BROWSER_BUDGET_MS);
  expect(plan.reasons.join(' ')).toMatch(/Broad change: 5 spec files.*Running 4 within the 3-minute budget.*ci:full/);
});

test('a changed spec takes the budget before other broad specs', () => {
  const plan = select('affected', ['src/lib/utils.ts', 'e2e/admin-flows.spec.ts'], 'abc', undefined, { map });
  const filter = new RegExp(plan.suitePattern);
  expect(filter.test('desktop admin-flows.spec.ts funnels')).toBe(true);
  expect(filter.test('desktop favorites-picker.spec.ts picks')).toBe(false);
});

test('a changed spec runs itself, with its file name escaped', () => {
  const plan = select('affected', ['e2e/sweeps/home-sweep.spec.ts'], 'abc', undefined, { map });
  expect(plan.suitePattern).toBe('@ci-smoke|sweeps/home-sweep\\.spec\\.ts');
  expect(new RegExp(plan.suitePattern).test('desktop sweeps/home-sweepXspec.ts')).toBe(false);
});

test('without a test map or a usable base, app changes run smoke and say why', () => {
  expect(select('affected', ['src/league/LeagueApp.tsx'], 'abc').reasons.join(' ')).toContain('No test map');
  expect(select('affected', [], null, 'base unavailable')).toMatchObject({ effectiveMode: 'fast', suitePattern: '@ci-smoke' });
});

test('only an explicit documentation diff skips code checks; clean input still runs smoke', () => {
  expect(select('affected', ['docs/handoff/example.md', 'README.md'], 'abc', undefined, { map }).effectiveMode).toBe('docs');
  expect(select('affected', [], 'abc', undefined, { map }).effectiveMode).toBe('fast');
  expect(select('full', ['README.md'], 'abc', undefined, { map })).toMatchObject({ effectiveMode: 'full', suitePattern: '.*' });
});

