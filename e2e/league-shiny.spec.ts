import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';
import { SHINY_STAR } from '../src/components/shiny/shinyMarks';

const SHINY = /\/sprites\/pokemon\/shiny\/\d+\.png$/;
const hexRgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
/** The shiny star's fill runs between these two colors. */
const STAR_FILL = SHINY_STAR.fill.stops.map(([, color]) => hexRgb(color));

const card = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('league-builder')!).state.cards[0]);
/** The shiny buttons on the card, which sit beside a cell, not inside it. */
const cellShiny = (page: Page, cell: string) => page.locator(`[data-seat]:has(> [data-testid="${cell}"]) button[data-shiny-mark]`);
const pressedOnCard = (page: Page) => page.locator('[data-lg-card-root] button[data-shiny-mark][aria-pressed="true"]');

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
  await expect(page.locator('[data-testid="verify-evo-card"] img[src*="/shiny/11096.png"]'), "the Heart Trim shows Larryturbo's shiny").toBeVisible();
  await expect(page.locator('[data-testid="verify-evo-card"] img[src*="/shiny/676.png"]')).toBeVisible();
  await expect(page.locator('[data-testid="verify-evo-card"] img[src*="/shiny/11097.png"]')).toBeVisible();
  await testInfo.attach('furfrou-shiny-browser.png', { body: await page.screenshot(), contentType: 'image/png' });
  await search(page, 'pichu');
  const spiky = page.locator('[data-testid="verify-evo-card"]', { has: page.locator('img[src*="/11064.png"]') });
  await expect(spiky.getByTestId('no-shiny-mark'), 'a held shiny shows as no shiny').toBeVisible();
  await expect(spiky.locator('img[src*="/11064.png"]')).toHaveCSS('filter', 'grayscale(1)');
  await testInfo.attach('no-shiny-browser.png', { body: await page.screenshot(), contentType: 'image/png' });

  await search(page, 'lapras');
  await lapras.click();
  expect((await card(page)).lines).toMatchObject([{ branch: [131], shiny: true }]);
  await expect(page.locator('[data-testid="card-cell-1-1"] img')).toHaveAttribute('src', /\/shiny\/131\.png$/);
  await expect(pressedOnCard(page)).toHaveCount(1);
  await expect(cellShiny(page, 'card-cell-1-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="league-slot-0"] img[src*="/shiny/131.png"]')).toBeVisible();

  await page.click('[data-testid="slot-partner"]');
  await expect(toggle, 'an empty partner slot opens with Shiny off').toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await search(page, 'psyduck');
  await page.locator('[data-testid="verify-evo-card"] img[alt="Psyduck"]').click();
  expect(await card(page)).toMatchObject({ partnerId: 54, partnerShiny: true });
  await expect(page.locator('[data-testid="slot-partner"] img')).toHaveAttribute('src', /\/shiny\/54\.png$/);
  await expect(page.getByTestId('slot-partner').getByRole('button', { name: 'Shiny Psyduck' })).toHaveAttribute('aria-pressed', 'true');

  await page.click('[data-testid="slot-ace"]');
  await search(page, 'lapras');
  await page.locator('[data-testid="verify-evo-card"] img[alt="Lapras"]').click();
  await expect(page.locator('[data-testid="slot-ace"] img')).toHaveAttribute('src', /\/shiny\/131\.png$/);
  await expect(page.getByTestId('slot-ace').getByRole('button', { name: 'Shiny Lapras' })).toHaveAttribute('aria-pressed', 'true');

  await page.click('[data-testid="card-cell-11-1"]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await search(page, 'kyogre');
  await page.locator('[data-testid="verify-evo-card"] img[alt="Kyogre"]').click();
  expect((await card(page)).legends).toMatchObject([{ pokemonId: 382, seat: 1, shiny: true }]);
  await expect(cellShiny(page, 'card-cell-11-1')).toHaveAttribute('aria-pressed', 'true');
  await testInfo.attach('shiny-card.png', { body: await page.screenshot(), contentType: 'image/png' });

  await page.locator('[data-league-export]').last().click();
  const preview = page.locator('[data-export-preview] img');
  await expect(page.locator('[data-league-export-confirm]')).toBeEnabled({ timeout: 45_000 });
  const exported = await preview.first().evaluate(async (img: HTMLImageElement, [from, to]) => {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Pixels on the star's fill gradient, within rounding.
    let stars = 0;
    for (let i = 0; i < data.length; i += 4) {
      const t = (from[1] - data[i + 1]) / (from[1] - to[1]);
      if (t < 0 || t > 1) continue;
      if (Math.abs(data[i] - (from[0] + (to[0] - from[0]) * t)) <= 4 && Math.abs(data[i + 2] - (from[2] + (to[2] - from[2]) * t)) <= 6) stars++;
    }
    return { width: canvas.width, height: canvas.height, starPixels: stars };
  }, STAR_FILL);
  await page.keyboard.press('Escape');
  await testInfo.attach('card-export.json', { body: JSON.stringify(exported, null, 2), contentType: 'application/json' });
  expect(exported.starPixels, 'the export draws no star').toBeLessThan(40);
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
  await expect(toggle, 'a shiny line opens its replace browser with Shiny on').toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await search(page, 'lapras');
  await page.locator('[data-testid="verify-evo-card"] img[alt="Lapras"]').click();
  const line = (await card(page)).lines[0];
  await testInfo.attach('converted-line.json', { body: JSON.stringify(line, null, 2), contentType: 'application/json' });
  expect(line.branch).toEqual([131]);
  expect(line.shiny).toBeUndefined();
  await expect(page.locator('[data-testid="card-cell-1-1"] img')).not.toHaveAttribute('src', SHINY);
  await expect(cellShiny(page, 'card-cell-1-1')).toHaveAttribute('aria-pressed', 'false');
  await expect(pressedOnCard(page)).toHaveCount(0);
});

test('the Pokédex builder browser has no Shiny switch and loads no shiny sprites', async ({ page }, testInfo) => {
  const shinyRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/sprites/pokemon/shiny/')) shinyRequests.push(request.url()); });
  await page.goto('/pokedex-builder?lang=en');
  await page.locator('[data-add-slot]').first().click();
  await expect(page.locator('[data-result-count]').first()).toBeVisible();
  await expect(page.locator('[data-testid="verify-evo-card"] img').first()).toBeVisible();
  await page.evaluate(() => new Promise<void>((done) => requestIdleCallback(() => done(), { timeout: 4000 })));
  await page.waitForTimeout(1000);
  await testInfo.attach('pokedex-browser.png', { body: await page.screenshot(), contentType: 'image/png' });
  await expect(page.getByTestId('browser-shiny-toggle')).toHaveCount(0);
  expect(shinyRequests).toEqual([]);
});

test('the Shiny switch sits after the count and a divider, at the end of the search row, and keeps its width when on @viewport', async ({ page }, testInfo) => {
  await openCard(page);
  await page.click('[data-testid="card-cell-1-1"]');
  const toggle = page.getByTestId('browser-shiny-toggle');
  await expect(toggle).toHaveText('Shiny');
  await expect(toggle.locator('path[d="m2 2 20 20"]')).toHaveCount(1);
  const fit = () => toggle.evaluate((button) => ({
    width: button.getBoundingClientRect().width,
    countLeft: button.closest('div.flex')!.querySelector('[data-result-count]')!.getBoundingClientRect().left,
  }));
  const off = await fit();
  await toggle.click();
  await expect(toggle.locator('path[d="m2 2 20 20"]')).toHaveCount(0);
  const on = await fit();
  await testInfo.attach('toggle-fit.json', { body: JSON.stringify({ off, on }, null, 2), contentType: 'application/json' });
  expect(on.width, 'turning Shiny on keeps the pill as wide').toBeCloseTo(off.width, 2);
  expect(on.countLeft, 'and leaves the count where it was').toBeCloseTo(off.countLeft, 2);
  await search(page, 'furfrou');
  await expect(page.locator('img[src*="/shiny/11096.png"]').first()).toBeVisible();
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
