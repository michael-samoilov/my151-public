import { expect, test, type Page } from './support/test';
import { seededLeague } from './support/leagueSeed';

const saved = JSON.stringify({ state: { fills: { 'fire|1': 10034, 'grass|1': 1, 'favorite|favorite': 11001 } }, version: 3 });
const count = (page: Page) => page.locator('[data-result-count]').first();
const favorites = (page: Page) => page.getByRole('button', { name: /My favorites/ }).first();

async function seedFavorites(page: Page, value = saved) {
  await page.addInitScript((raw) => localStorage.setItem('favorite-picker', raw), value);
}

test('dex favorites map forms, combine with search, and refresh after reopening', async ({ page }, testInfo) => {
  await seedFavorites(page);
  await page.goto('/pokedex-builder?lang=en');
  await page.locator('[data-add-slot]').first().click();
  await page.getByRole('button', { name: /^Clear$/ }).first().click();
  await favorites(page).click();
  await expect(count(page)).toHaveAttribute('data-result-count', '7');
  await page.locator('input[placeholder]').last().fill('charizard');
  await expect(count(page)).toHaveAttribute('data-result-count', '3');
  await page.locator('input[placeholder]').last().fill('squirtle');
  await expect(count(page)).toHaveAttribute('data-result-count', '0');
  await page.locator('input[placeholder]').last().fill('');
  await expect(count(page)).toHaveAttribute('data-result-count', '7');
  expect(await page.evaluate(() => localStorage.getItem('favorite-picker'))).toBe(saved);
  await page.getByTestId('browser-close').click();
  await page.evaluate(() => localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: { 'bug|1': 10 } }, version: 3 })));
  await page.locator('[data-add-slot]').first().click();
  await expect(count(page)).toHaveAttribute('data-result-count', '3');
  await expect(favorites(page)).toContainText('1');
  await testInfo.attach('refreshed-dex', { body: JSON.stringify({ favorites: 1, results: 3 }), contentType: 'application/json' });
});

test('malformed saved favorites give an empty filter without damaging the save', async ({ page }, testInfo) => {
  await seedFavorites(page, '{broken');
  await page.goto('/pokedex-builder?lang=en');
  await page.locator('[data-add-slot]').first().click();
  await favorites(page).click();
  await expect(count(page)).toHaveAttribute('data-result-count', '0');
  await favorites(page).click();
  await expect.poll(async () => Number(await count(page).getAttribute('data-result-count'))).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('favorite-picker'))).toBe('{broken');
  await testInfo.attach('malformed-save', { body: JSON.stringify({ raw: '{broken', browserRecovered: true }), contentType: 'application/json' });
});

test('league favorites intersect the team scope and My dex without changing the league', async ({ page }, testInfo) => {
  await seedFavorites(page);
  await seededLeague(page);
  await page.addInitScript(() => localStorage.setItem('personal-151-pokedex-v3', JSON.stringify({ state: { sections: { other: [6] } }, version: 3 })));
  await page.goto('/custom-gym-leader?lang=en');
  await page.getByTestId('league-slot-0').click();
  await page.getByTestId('card-cell-1-1').waitFor();
  await page.getByTestId('slot-ace').click();
  await expect(page.locator('[data-filter-chip="scope-locked"]')).toBeVisible();
  const league = await page.evaluate(() => localStorage.getItem('league-builder'));
  await favorites(page).click();
  await expect(count(page)).toHaveAttribute('data-result-count', '0');
  await favorites(page).click();
  await expect.poll(async () => Number(await count(page).getAttribute('data-result-count'))).toBeGreaterThan(0);
  await page.getByTestId('browser-close').click();
  await page.getByTestId('card-cell-1-1').click();
  await page.getByRole('button', { name: /^Clear$/ }).first().click();
  await favorites(page).click();
  await expect(count(page)).toHaveAttribute('data-result-count', '7');
  await page.locator('[data-filter-chip="my-dex"]').click();
  await expect(count(page)).toHaveAttribute('data-result-count', '3');
  expect(await page.evaluate(() => localStorage.getItem('favorite-picker'))).toBe(saved);
  expect(await page.evaluate(() => localStorage.getItem('league-builder'))).toBe(league);
  await testInfo.attach('league-intersection', { body: JSON.stringify({ favorites: 3, inMyDex: 1, displayedLineMembers: 3, inBrockTeam: 0 }), contentType: 'application/json' });
});
