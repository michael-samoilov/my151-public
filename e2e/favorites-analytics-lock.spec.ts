import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';

const UNLOCK_KEY = 'personal-151-favorites-analytics-v1';
const seedFills = JSON.parse(readFileSync('docs/favorite-picker-work/export/seed.json', 'utf8')).fills as Record<string, number>;
const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying',
  'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const typePicks = Object.entries(seedFills)
  .filter(([key]) => /^[a-z]+\|[12]$/.test(key) && TYPES.includes(key.split('|')[0]) && key !== 'water|1');
const twentyFour = Object.fromEntries(typePicks.slice(0, 24));
const twentyFive = Object.fromEntries(typePicks.slice(0, 25));

const tab = (page: Page) => page.locator('#favorites-tab-analytics');
const dashboard = (page: Page) => page.getByTestId('favorites-analytics');
const nudge = (page: Page) => page.getByRole('status').filter({ hasText: 'Analytics unlocked' });

async function open(page: Page, fills: Record<string, number>, unlocked = false) {
  await page.addInitScript(([saved, flag, key]) => {
    localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: saved }, version: 3 }));
    if (flag) localStorage.setItem(key, '1');
  }, [fills, unlocked, UNLOCK_KEY] as const);
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await expect(page.getByTestId('favorites-header')).toBeVisible();
}

async function artifact(page: Page, testInfo: TestInfo, name: string, evidence: unknown) {
  await testInfo.attach(name, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  await testInfo.attach(`${name}-screen`, { body: await page.screenshot(), contentType: 'image/png' });
}

test('Analytics stays locked below 25 favorites, and the 25th unlocks it with the Dex popup', async ({ page }, testInfo) => {
  expect(Object.keys(twentyFour)).toHaveLength(24);
  await open(page, twentyFour);
  await expect(tab(page)).toHaveAttribute('data-locked');
  await expect(tab(page)).toHaveAccessibleName('Analytics locked. Reach 25 Pokémon to unlock');
  await tab(page).click();
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('Reach 25 Pokémon to unlock Analytics');
  await expect(tip).toContainText('24/25');
  await expect(tab(page)).toHaveAttribute('aria-selected', 'false');
  await expect(dashboard(page)).toBeHidden();
  const locked = { tooltip: await tip.innerText() };
  await page.keyboard.press('Escape');

  await page.getByTestId('favorites-cell-water-1').click();
  await page.getByTestId('favorites-pick-7').click();
  await expect(nudge(page)).toBeVisible();
  await expect(nudge(page)).toContainText('Your favorites have enough shape to analyze.');
  await expect(tab(page)).not.toHaveAttribute('data-locked');
  const popup = await nudge(page).innerText();
  await nudge(page).getByRole('button', { name: 'Open Analytics' }).click();
  await expect(tab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(dashboard(page)).toBeVisible();
  await expect(nudge(page)).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), UNLOCK_KEY)).toBe('1');
  await artifact(page, testInfo, 'lock-then-unlock', { locked, popup });
});

test('the unlock stays after cells are cleared', async ({ page }, testInfo) => {
  await open(page, { 'fire|1': 4 }, true);
  await expect(tab(page)).not.toHaveAttribute('data-locked');
  await tab(page).click();
  await expect(tab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(dashboard(page)).toBeVisible();
  await artifact(page, testInfo, 'sticky', { fills: 1, selected: await tab(page).getAttribute('aria-selected') });
});

test('a restored grid of 25 unlocks Analytics without the popup', async ({ page }, testInfo) => {
  await open(page, twentyFive);
  await expect(tab(page)).not.toHaveAttribute('data-locked');
  await page.waitForTimeout(1500);
  await expect(nudge(page)).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), UNLOCK_KEY)).toBe('1');
  await artifact(page, testInfo, 'restored', { fills: Object.keys(twentyFive).length });
});
