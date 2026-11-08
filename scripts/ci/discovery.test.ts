import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { discoveryCounts, type Discovery } from './discovery';
import { select, type Selection } from './policy';
import type { TestMap } from './testMap';

function inventory(directory: string, selection?: Selection): Discovery {
  const output = join(directory, 'discovery.json');
  if (selection) writeFileSync(join(directory, 'selection.json'), JSON.stringify(selection));
  execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', selection ? 'scripts/ci/playwright.config.ts' : 'playwright.config.ts', '--list', '--reporter=json'], {
    env: { ...process.env, MY151_CI_RUN_DIR: directory, PLAYWRIGHT_JSON_OUTPUT_FILE: output }, stdio: 'pipe',
  });
  return JSON.parse(readFileSync(output, 'utf8'));
}

test('real Playwright discovery preserves full coverage and intersects mapped specs with viewport and smoke filters', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ci-discovery-'));
  try {
    const original = discoveryCounts(inventory(directory));
    const full = discoveryCounts(inventory(directory, select('full', [], null)));
    expect(full).toEqual(original);
    const smoke = discoveryCounts(inventory(directory, select('fast', [], null)));
    expect(smoke.total).toBeGreaterThanOrEqual(10);
    expect(smoke.total).toBeLessThanOrEqual(20);
    expect(smoke.projects.dev).toBeUndefined();
    expect(smoke.projects.mobile).toBeLessThan(smoke.projects.desktop);
    const map: TestMap = {
      version: 1, sourceCommit: 'base', recordedAt: '2026-11-08T00:00:00.000Z',
      specs: { 'e2e/sweeps/home-sweep.spec.ts': { ms: 1, tests: 1, unmapped: false }, 'e2e/dev/language-picker.spec.ts': { ms: 1, tests: 1, unmapped: false } },
      sources: { 'src/components/home/HomePage.tsx': ['e2e/sweeps/home-sweep.spec.ts', 'e2e/dev/language-picker.spec.ts'] },
    };
    const hub = discoveryCounts(inventory(directory, select('affected', ['src/components/home/HomePage.tsx'], 'base', undefined, { map })));
    expect(hub.files['sweeps/home-sweep.spec.ts']).toBeGreaterThan(0);
    expect(hub.files['dev/language-picker.spec.ts']).toBeGreaterThan(0);
    expect(hub.projects.dev).toBeGreaterThan(0);
    expect(hub.files['favorites-export.spec.ts']).toBe(smoke.files['favorites-export.spec.ts']);
    expect(hub.files['admin-flows.spec.ts']).toBeUndefined();
    expect(hub.total).toBeLessThan(full.total);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 60_000);
