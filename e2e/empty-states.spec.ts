import { expect, test, type Locator, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

const count = (page: Page) => page.locator('[data-result-count]').filter({ visible: true }).first();
const results = async (page: Page) => Number(await count(page).getAttribute('data-result-count'));

async function openDexPicker(page: Page, lang = 'en') {
  await page.goto(`/pokedex-builder?lang=${lang}`);
  await page.locator('[data-add-slot]').first().click();
  const input = page.locator('input[placeholder]').filter({ visible: true }).first();
  await expect(input).toBeVisible();
  return input;
}

const emptyIn = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true }).first();

test('the Pokémon picker clears a search that finds nothing', async ({ page }, testInfo) => {
  const input = await openDexPicker(page);
  await input.fill('zzzz');
  const empty = emptyIn(page, 'browser-empty');
  await expect(empty.getByRole('heading', { name: 'No Pokémon match “zzzz”' })).toBeVisible();
  await expect(empty).toContainText('Check the spelling, or search by Pokédex number.');
  await empty.getByRole('button', { name: 'Clear search' }).click();
  await expect(input).toHaveValue('');
  await expect.poll(() => results(page)).toBeGreaterThan(0);
  await testInfo.attach('clear-search', { body: JSON.stringify({ query: 'zzzz', after: await results(page) > 0 }), contentType: 'application/json' });
});

test('a search inside My favorites offers to clear the filters, not the search', async ({ page }, testInfo) => {
  const input = await openDexPicker(page);
  await page.locator('[data-filter-chip="my-favorites"]').filter({ visible: true }).first().click();
  await input.fill('pikachu');
  const empty = emptyIn(page, 'browser-empty');
  await expect(empty.getByRole('heading', { name: 'No Pokémon match “pikachu”' })).toBeVisible();
  await expect(empty).toContainText('Your filters also apply to this search.');
  await empty.getByRole('button', { name: 'Clear filters' }).click();
  await expect(input).toHaveValue('pikachu');
  await expect.poll(() => results(page)).toBeGreaterThan(0);
  await testInfo.attach('clear-filters-in-search', { body: JSON.stringify({ query: 'pikachu', filter: 'my-favorites' }), contentType: 'application/json' });
});

test('the Pokémon picker clears filters that leave nothing', async ({ page }, testInfo) => {
  await openDexPicker(page);
  await page.locator('[data-filter-chip="my-favorites"]').filter({ visible: true }).first().click();
  await expect(count(page)).toHaveAttribute('data-result-count', '0');
  const empty = emptyIn(page, 'browser-empty');
  await expect(empty.getByRole('heading', { name: 'No Pokémon match these filters' })).toBeVisible();
  await empty.getByRole('button', { name: 'Clear filters' }).click();
  await expect.poll(() => results(page)).toBeGreaterThan(0);
  await expect(page.locator('[data-filter-chip="my-favorites"]').filter({ visible: true }).first()).toBeVisible();
  await testInfo.attach('clear-filters', { body: JSON.stringify({ filter: 'my-favorites', after: await results(page) > 0 }), contentType: 'application/json' });
});

test('the TM picker clears a search, then filters, that find nothing', async ({ page }, testInfo) => {
  await blankLeague(page);
  await page.addInitScript(() => {
    const saved = JSON.parse(localStorage.getItem('league-builder')!);
    saved.state.cards[0].type = 'fire';
    localStorage.setItem('league-builder', JSON.stringify(saved));
  });
  await page.goto('/custom-gym-leader?lang=en');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.click('[data-testid="slot-tm"]');
  const search = page.getByTestId('tm-search');
  await search.fill('zzzz');
  const empty = page.getByTestId('tm-empty');
  await expect(empty.getByRole('heading', { name: 'No moves match “zzzz”' })).toBeVisible();
  await empty.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('[data-testid^="tm-move-"]').first()).toBeVisible();

  await page.getByTestId('tm-filter-contest').click();
  await page.getByRole('button', { name: 'Cool', exact: true }).click();
  await expect(empty.getByRole('heading', { name: 'No moves match these filters' })).toBeVisible();
  await empty.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByTestId('tm-chip-type-fire')).toHaveCount(0);
  await expect(page.locator('[data-testid^="tm-move-"]').first()).toBeVisible();
  await testInfo.attach('tm-empty', { body: JSON.stringify({ search: 'zzzz', filters: ['fire', 'cool'] }), contentType: 'application/json' });
});

test('Pokédex analytics with no Pokémon goes back to Build', async ({ page }, testInfo) => {
  await page.goto('/pokedex-builder?tune&lang=en');
  await page.waitForFunction(() => '__pokedexStore' in window);
  await page.evaluate(() => {
    localStorage.setItem('p151-league-promo-seen', '1');
    const store = (window as unknown as { __pokedexStore: { setState: (patch: Record<string, unknown>) => void } }).__pokedexStore;
    store.setState({ milestoneMax: 100, milestoneCelebrated: [25, 100], milestoneCelebration: null });
  });
  await page.locator('[data-nav="analytics"]').click();
  const empty = page.getByTestId('analytics-empty');
  await expect(empty.getByRole('heading', { name: 'Your Pokédex has no Pokémon yet' })).toBeVisible();
  await empty.getByRole('button', { name: 'Add Pokémon' }).click();
  await expect(page.locator('[data-nav="builder"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-add-slot]').first()).toBeVisible();
  await testInfo.attach('analytics-empty', { body: JSON.stringify({ view: 'builder' }), contentType: 'application/json' });
});

async function measure(empty: Locator) {
  return empty.evaluate((el) => {
    const lines = (node: Element) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    };
    const part = (selector: string) => {
      const node = el.querySelector(selector)!;
      const box = node.getBoundingClientRect();
      return { lines: lines(node), inside: box.left >= 0 && box.right <= window.innerWidth };
    };
    return { title: part('h2'), body: part('p'), button: part('button') };
  });
}

test.describe('the empty state fits every screen in German', { tag: '@viewport' }, () => {
  test('a long search and an empty column favorite', async ({ page }, testInfo) => {
    const input = await openDexPicker(page, 'de');
    await input.fill('mewtwoooooooooooooooo');
    const search = await measure(emptyIn(page, 'browser-empty'));

    await page.goto('/favorite-pokemon-picker?lang=de');
    const cell = page.getByTestId('favorites-cell-electric-favorite');
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    const favorite = await measure(emptyIn(page, 'favorites-picker-empty'));

    for (const [name, m] of Object.entries({ search, favorite })) {
      expect(m.title.lines, `${name} title`).toBeLessThanOrEqual(2);
      expect(m.body.lines, `${name} body`).toBeLessThanOrEqual(2);
      expect(m.button.lines, `${name} button`).toBe(1);
      expect([m.title.inside, m.body.inside, m.button.inside], `${name} on screen`).toEqual([true, true, true]);
    }
    await testInfo.attach('german-fit', { body: JSON.stringify({ width: page.viewportSize()?.width, search, favorite }), contentType: 'application/json' });
  });
});
