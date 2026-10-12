import { expect, test, type Page } from '@playwright/test';

// The 404 page (public/404.html, built by docs/design/404-page/build.mjs) is a
// Gen 1 wild encounter: the encounter line, the scene, "That page does not
// exist", then a battle menu. One cursor marks the selected entry: it starts
// on the first, follows the arrow keys (wrapping round), follows the mouse,
// and Enter or Space opens the entry under it.

const cursors = (page: Page) =>
  page.locator('.menu a').evaluateAll((links) =>
    links.map((a) => getComputedStyle(a, '::before').visibility === 'visible'));
const at = async (page: Page) => (await cursors(page)).indexOf(true);

test('the 404 menu moves one cursor with the arrow keys and the mouse', async ({ page }, testInfo) => {
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { name: '404: A wild MISSINGNO. appeared!' })).toBeVisible();
  await expect(page.getByText('That page does not exist')).toBeVisible();

  const steps: Record<string, number> = { start: await at(page) };
  expect((await cursors(page)).filter(Boolean)).toHaveLength(1);

  await page.keyboard.press('ArrowDown');
  steps.down = await at(page);
  await expect(page.locator('.menu a').nth(1)).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  steps.wrapUp = await at(page);

  await page.locator('.menu a').nth(2).hover();
  steps.hover = await at(page);
  expect((await cursors(page)).filter(Boolean)).toHaveLength(1);

  expect(steps).toEqual({ start: 0, down: 1, wrapUp: 3, hover: 2 });
  await testInfo.attach('cursor-steps.json', { body: JSON.stringify(steps), contentType: 'application/json' });

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/favorite-pokemon-picker$/);
});
