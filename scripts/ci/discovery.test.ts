import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { discoveryCounts, type Discovery } from './discovery';
import { select, type Selection } from './policy';

function inventory(directory: string, selection?: Selection): Discovery {
  const output = join(directory, 'discovery.json');
  if (selection) writeFileSync(join(directory, 'selection.json'), JSON.stringify(selection));
  execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', selection ? 'scripts/ci/playwright.config.ts' : 'playwright.config.ts', '--list', '--reporter=json'], {
    env: { ...process.env, MY151_CI_RUN_DIR: directory, PLAYWRIGHT_JSON_OUTPUT_FILE: output }, stdio: 'pipe',
  });
  return JSON.parse(readFileSync(output, 'utf8'));
}

test('real Playwright discovery preserves full coverage and intersects owned families with viewport and smoke filters', () => {
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
    const affected = discoveryCounts(inventory(directory, select('affected', ['src/favorites/FavoritesApp.tsx'], 'base')));
    expect(affected.total).toBeGreaterThan(smoke.total);
    expect(affected.files['favorite-browser-filter.spec.ts']).toBeGreaterThan(0);
    expect(affected.files['favorites-export.spec.ts']).toBeGreaterThan(smoke.files['favorites-export.spec.ts']);
    expect(affected.files['league-export-sheet.spec.ts']).toBe(smoke.files['league-export-sheet.spec.ts']);
    const dex = discoveryCounts(inventory(directory, select('affected', ['src/components/pokedex/PokedexGrid.tsx'], 'base')));
    expect(dex.files['drag-hold.spec.ts']).toBeGreaterThan(0);
    expect(dex.files['sheet-behaviour.spec.ts']).toBeGreaterThan(0);
    expect(dex.projects.dev).toBeGreaterThan(0);
    expect(dex.total).toBeLessThan(full.total);
    const league = discoveryCounts(inventory(directory, select('affected', ['src/league/components/CardHelp.tsx'], 'base')));
    expect(league.files['league-card-drag.spec.ts']).toBeGreaterThan(0);
    expect(league.files['header-chrome.spec.ts']).toBeGreaterThan(0);
    expect(league.total).toBeLessThan(full.total);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 60_000);
