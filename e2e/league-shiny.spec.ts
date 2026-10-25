import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

const SHINY = /\/sprites\/pokemon\/shiny\/\d+\.png$/;
const GOLD_STAR = [245, 179, 1];

const card = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('league-builder')!).state.cards[0]);

async function search(page: Page, query: string) {
  await page.getByPlaceholder(/search/i).last().fill(query);
}

async function openCard(page: Page) {
  await blankLeague(page);
  await page.goto('/custom-gym-leader?lang=en');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
}

test('picks made with Shiny on are shiny on the card, its ace, partner, and legend, and its export', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await openCard(page);
  await page.click('[data-testid="card-cell-1-1"]');
  const toggle = page.getByTestId('browser-shiny-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await search(page, 'lapras');
  const lapras = page.locator('[data-testid="verify-evo-card"] img[alt="Lapras"]');
  await expect(lapras).toHaveAttribute('src', /\/sprites\/pokemon\/131\.png/);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(lapras).toHaveAttribute('src', /\/sprites\/pokemon\/shiny\/131\.png$/);
  await search(page, 'furfrou');
  const heart = page.locator('[data-testid="verify-evo-card"]', { has: page.locator('img[src*="/11096.png"]') });
  await expect(heart.getByTestId('no-shiny-mark')).toBeVisible();
  await expect(heart.locator('img[src*="/11096.png"]')).toHaveCSS('filter', 'grayscale(1)');
  await expect(page.locator('[data-testid="verify-evo-card"] img[src*="/shiny/676.png"]')).toBeVisible();
  await expect(page.locator('[data-testid="verify-evo-card"] img[src*="/shiny/11097.png"]')).toBeVisible();
  await testInfo.attach('no-shiny-browser.png', { body: await page.screenshot(), contentType: 'image/png' });

  await search(page, 'lapras');
  await lapras.click();
  expect((await card(page)).lines).toMatchObject([{ branch: [131], shiny: true }]);
  await expect(page.locator('[data-testid="card-cell-1-1"] img')).toHaveAttribute('src', /\/shiny\/131\.png$/);
  await expect(page.locator('[data-testid^="card-cell-"] [data-testid="shiny-star"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="card-cell-1-1"] [data-testid="shiny-star"]')).toBeVisible();
  await expect(page.locator('[data-testid="league-slot-0"] img[src*="/shiny/131.png"]')).toBeVisible();

  await page.click('[data-testid="slot-partner"]');
  await search(page, 'psyduck');
  await page.locator('[data-testid="verify-evo-card"] img[alt="Psyduck"]').click();
  expect(await card(page)).toMatchObject({ partnerId: 54, partnerShiny: true });
  await expect(page.locator('[data-testid="slot-partner"] img')).toHaveAttribute('src', /\/shiny\/54\.png$/);
  await expect(page.getByTestId('slot-partner').getByTestId('shiny-star')).toBeVisible();

  await page.click('[data-testid="slot-ace"]');
  await search(page, 'lapras');
  await page.locator('[data-testid="verify-evo-card"] img[alt="Lapras"]').click();
  await expect(page.locator('[data-testid="slot-ace"] img')).toHaveAttribute('src', /\/shiny\/131\.png$/);
  await expect(page.getByTestId('slot-ace').getByTestId('shiny-star')).toBeVisible();

  await page.click('[data-testid="card-cell-11-1"]');
  await search(page, 'kyogre');
  await page.locator('[data-testid="verify-evo-card"] img[alt="Kyogre"]').click();
  expect((await card(page)).legends).toMatchObject([{ pokemonId: 382, seat: 1, shiny: true }]);
  await expect(page.locator('[data-testid="card-cell-11-1"] [data-testid="shiny-star"]')).toBeVisible();
  await testInfo.attach('shiny-card.png', { body: await page.screenshot(), contentType: 'image/png' });

  await page.locator('[data-league-export]').last().click();
  const preview = page.locator('[data-export-preview] img');
  await expect(page.locator('[data-league-export-confirm]')).toBeEnabled({ timeout: 45_000 });
  const exported = await preview.first().evaluate(async (img: HTMLImageElement, gold) => {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let stars = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] === gold[0] && data[i + 1] === gold[1] && data[i + 2] === gold[2]) stars++;
    return { width: canvas.width, height: canvas.height, goldPixels: stars };
  }, GOLD_STAR);
  await page.keyboard.press('Escape');
  await testInfo.attach('card-export.json', { body: JSON.stringify(exported, null, 2), contentType: 'application/json' });
  expect(exported.goldPixels).toBeGreaterThan(400);
});

test('tapping a held line with Shiny off turns it back to normal', async ({ page }, testInfo) => {
  await openCard(page);
  await page.click('[data-testid="card-cell-1-1"]');
  await page.getByTestId('browser-shiny-toggle').click();
  await search(page, 'lapras');
  await page.locator('[data-testid="verify-evo-card"] img[alt="Lapras"]').click();
  expect((await card(page)).lines).toMatchObject([{ branch: [131], shiny: true }]);
  if (await page.getByTestId('browser-shiny-toggle').isVisible()) await page.keyboard.press('Escape');

  await page.click('[data-testid="card-cell-1-1"]');
  const toggle = page.getByTestId('browser-shiny-toggle');
  await expect(toggle, 'the switch keeps its state across opens').toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await search(page, 'lapras');
  await page.locator('[data-testid="verify-evo-card"] img[alt="Lapras"]').click();
  const line = (await card(page)).lines[0];
  await testInfo.attach('converted-line.json', { body: JSON.stringify(line, null, 2), contentType: 'application/json' });
  expect(line.branch).toEqual([131]);
  expect(line.shiny).toBeUndefined();
  await expect(page.locator('[data-testid="card-cell-1-1"] img')).not.toHaveAttribute('src', SHINY);
  await expect(page.locator('[data-testid^="card-cell-"] [data-testid="shiny-star"]')).toHaveCount(0);
});

test('the Pokédex builder browser has no Shiny switch', async ({ page }, testInfo) => {
  await page.goto('/pokedex-builder?lang=en');
  await page.locator('[data-add-slot]').first().click();
  await expect(page.locator('[data-result-count]').first()).toBeVisible();
  await testInfo.attach('pokedex-browser.png', { body: await page.screenshot(), contentType: 'image/png' });
  await expect(page.getByTestId('browser-shiny-toggle')).toHaveCount(0);
});

test('the Shiny switch sits after the count and a divider, at the end of the search row @viewport', async ({ page }, testInfo) => {
  await openCard(page);
  await page.click('[data-testid="card-cell-1-1"]');
  const toggle = page.getByTestId('browser-shiny-toggle');
  await expect(toggle).toHaveText('Shiny');
  await expect(toggle.locator('path[d="M3 3l18 18"]')).toHaveCount(1);
  await toggle.click();
  await expect(toggle.locator('path[d="M3 3l18 18"]')).toHaveCount(0);
  await search(page, 'furfrou');
  await expect(page.getByTestId('no-shiny-mark').first()).toBeVisible();
  const row = await toggle.evaluate((button) => {
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const searchRow = button.closest('div.flex')!;
    const divider = button.parentElement!;
    const count = searchRow.querySelector('[data-result-count]')!;
    const input = searchRow.querySelector('input')!;
    return {
      input: box(input), count: box(count), divider: box(divider), toggle: box(button), row: box(searchRow),
      dividerBorder: getComputedStyle(divider).borderLeftWidth,
      last: searchRow.lastElementChild === divider,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    };
  });
  await testInfo.attach('search-row.png', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('search-row.json', { body: JSON.stringify(row, null, 2), contentType: 'application/json' });
  expect(row.last).toBe(true);
  expect(row.dividerBorder).toBe('1px');
  expect(row.input.right).toBeLessThanOrEqual(row.count.left);
  expect(row.input.right - row.input.left, 'the search input keeps room to type').toBeGreaterThanOrEqual(100);
  expect(row.count.right).toBeLessThanOrEqual(row.divider.left);
  expect(row.toggle.right).toBeLessThanOrEqual(row.row.right + 0.5);
  expect(row.scrollWidth).toBeLessThanOrEqual(row.viewport);
});
