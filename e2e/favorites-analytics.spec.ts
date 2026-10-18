import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seedDex, TUNE_URL } from './support/dexSeed';

test.setTimeout(60_000);
const fullSeed = JSON.parse(readFileSync('docs/favorite-picker-work/export/seed.json', 'utf8')).fills as Record<string, number>;
const analytics = (page: Page) => page.getByRole('tab', { name: 'Analytics', exact: true });
const picker = (page: Page) => page.getByRole('tab', { name: 'Grid', exact: true });
const dashboard = (page: Page) => page.getByTestId('favorites-analytics');
const chart = (page: Page, name: string) => dashboard(page).locator(`[data-favorite-chart="${name}"]`);
async function seed(page: Page, fills: Record<string, number>) {
  await page.addInitScript(saved => localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: saved }, version: 3 })), fills);
}
async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('favorite-picker') ?? '{}').state.fills);
}
async function openAnalytics(page: Page) {
  await analytics(page).click();
  await expect(dashboard(page)).toBeVisible();
  await expect(dashboard(page).locator('[data-favorite-chart]')).toHaveCount(5);
}
async function artifact(page: Page, testInfo: TestInfo, name: string, evidence: unknown) {
  await testInfo.attach(name, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  await testInfo.attach(`${name}-screen`, { body: await page.screenshot(), contentType: 'image/png' });
}
async function rowValues(page: Page, dimension: string, key: string) {
  const row = chart(page, dimension).locator(`[data-favorite-chart-row="${key}"]`);
  await expect(row).toHaveCount(1);
  return row.locator('td').allTextContents();
}
const number = (text: string) => Number(text.replace(/[^\d.-]/g, ''));
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem('personal-151-favorites-analytics-v1', '1')));

test('short header retains full search title and keyboard tabs stay on the same URL', async ({ page, request }, testInfo) => {
  await seed(page, { 'fire|1': 6 });
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Favorite Pokémon Picker');
  await expect(page).toHaveTitle(/Favorite Pokémon Picker by Type and Generation \| my151/);
  const staticHtml = await (await request.get('/favorite-pokemon-picker')).text();
  expect(staticHtml).toContain('<title>Favorite Pokémon Picker by Type and Generation | my151</title>');
  const url = page.url();
  await expect(picker(page)).toHaveAttribute('aria-selected', 'true');
  await picker(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(analytics(page)).toBeFocused();
  await expect(analytics(page)).toHaveAttribute('aria-selected', 'true');
  await expect(dashboard(page)).toBeVisible();
  expect(page.url()).toBe(url);
  await page.keyboard.press('Home');
  await expect(picker(page)).toBeFocused();
  await expect(picker(page)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(analytics(page)).toBeFocused();
  await expect(analytics(page)).toHaveAttribute('aria-selected', 'true');
  for (const tab of [picker(page), analytics(page)]) {
    const panelId = await tab.getAttribute('aria-controls');
    const panel = page.locator(`[id="${panelId}"]`);
    await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', await tab.getAttribute('id') ?? '');
  }
  await artifact(page, testInfo, 'keyboard-seo', { url, title: await page.title(), fills: await saved(page) });
});

test('real selectors exclude favorite pointers and forced cells while guaranteed types stay neutral', async ({ page }, testInfo) => {
  await seed(page, { 'fire|1': 6, 'ghost|2': 200, 'favorite|1': 6, 'fire|favorite': 6, 'favorite|favorite': 6 });
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await openAnalytics(page);
  const fire = await rowValues(page, 'type', 'fire');
  const flying = await rowValues(page, 'type', 'flying');
  expect(number(fire[0])).toBe(1);
  expect(number(fire[1])).toBe(1);
  expect(number(fire[2])).toBe(1);
  expect(number(flying[0])).toBe(1);
  expect(number(flying[1])).toBeCloseTo(1 / 6, 1);
  expect(number(flying[2])).toBe(6);
  await artifact(page, testInfo, 'forced-and-pointer-exclusions', { fire, flying, fills: await saved(page) });
});

test('repeated independent choices remain two votes and charts update after a real new pick', async ({ page }, testInfo) => {
  await seed(page, { 'fire|1': 6, 'flying|1': 6 });
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await openAnalytics(page);
  const before = await rowValues(page, 'type', 'fire');
  expect(number(before[0])).toBe(2);
  await picker(page).click();
  await page.getByTestId('favorites-cell-water-1').click();
  await page.getByTestId('favorites-pick-7').click();
  await analytics(page).click();
  await expect(dashboard(page)).toBeVisible();
  const water = await rowValues(page, 'type', 'water');
  expect(number(water[0])).toBe(1);
  const fills = await saved(page);
  expect(fills['fire|1']).toBe(6);
  expect(fills['flying|1']).toBe(6);
  expect(fills['water|1']).toBe(7);
  await artifact(page, testInfo, 'live-repeat-votes', { before, water, fills });
});

test('empty analytics never invent numeric averages and sourced BST pools stay covered', async ({ page }, testInfo) => {
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await openAnalytics(page);
  const emptyText = await dashboard(page).innerText();
  expect(emptyText).not.toMatch(/NaN|Infinity/);
  expect(emptyText).not.toMatch(/(?:Your|Selector) avg:\s*0/);
  await page.evaluate(fills => localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills }, version: 3 })), { 'ground|4': 449 });
  await page.reload();
  await openAnalytics(page);
  const partial = await rowValues(page, 'type', 'ground');
  expect(number(partial[0])).toBe(1);
  const bst = await chart(page, 'bst').innerText();
  expect(bst).not.toMatch(/NaN|Infinity/);
  await expect(chart(page, 'bst')).toHaveAttribute('data-favorite-covered', '1');
  await expect(chart(page, 'bst')).toHaveAttribute('data-favorite-excluded', '0');
  await artifact(page, testInfo, 'empty-covered-bst', { emptyText, partial, bst });
});

test('switching tabs retains grid scroll and exporting from Analytics preserves both ordinary modes @viewport', async ({ page }, testInfo) => {
  await seed(page, fullSeed);
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  const scroller = page.getByTestId('favorites-grid-scroll');
  const scroll = await scroller.evaluate(el => { el.scrollLeft = 240; el.scrollTop = 120; return { left: el.scrollLeft, top: el.scrollTop }; });
  const before = await saved(page);
  await openAnalytics(page);
  await picker(page).click();
  expect(await scroller.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }))).toEqual(scroll);
  await openAnalytics(page);
  await page.getByTestId('favorites-export-open').click();
  await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30000 });
  const preview = page.locator('[data-export-preview-layer] img[src^="blob:"]');
  const full = await preview.evaluate(el => ({ width: (el as HTMLImageElement).naturalWidth, height: (el as HTMLImageElement).naturalHeight }));
  expect(full).toEqual({ width: 2832, height: 1724 });
  await page.locator('[data-favorites-export-mode="simplified"]').click();
  await expect(page.getByTestId('favorites-export-save')).toBeEnabled({ timeout: 30000 });
  await expect(page.getByTestId('favorites-export-stats')).not.toBeChecked();
  const simple = await preview.evaluate(el => ({ width: (el as HTMLImageElement).naturalWidth, height: (el as HTMLImageElement).naturalHeight }));
  expect(simple.width).toBeLessThan(full.width);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('favorites-export-open')).toBeFocused();
  await expect(dashboard(page)).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await artifact(page, testInfo, 'scroll-and-export', { scroll, full, simple, fills: Object.keys(before).length });
});

test('localized header and chart cards remain contained at narrow mobile and desktop widths @viewport', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, fullSeed);
  const reports: unknown[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().includes('[P151]')) errors.push(message.text()); });
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'zh-Hans', 'zh-Hant']) {
    errors.length = 0;
    await page.goto(`/favorite-pokemon-picker?notme&lang=${lang}`);
    const tab = page.locator('#favorites-tab-analytics');
    await tab.click();
    try { await expect(dashboard(page)).toBeVisible(); } catch (error) {
      await testInfo.attach(`runtime-${lang}`, { body: JSON.stringify(errors), contentType: 'application/json' });
      throw error;
    }
    const metrics = await page.evaluate(() => {
      const h1 = document.querySelector('h1')!.getBoundingClientRect();
      const tabs = document.querySelector('[role="tablist"]')!.getBoundingClientRect();
      const action = document.querySelector('[data-testid="favorites-export-open"]')!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('[data-favorite-chart]')].map(el => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width, scroll: el.scrollWidth, client: el.clientWidth }; });
      return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, h1: { left: h1.left, right: h1.right }, tabs: { left: tabs.left, right: tabs.right }, action: { left: action.left, right: action.right }, cards };
    });
    expect(metrics.documentWidth, `${lang} viewport ${metrics.width}`).toBeLessThanOrEqual(metrics.width + 1);
    expect(metrics.h1.right).toBeLessThanOrEqual(metrics.tabs.left + 1);
    expect(metrics.tabs.right).toBeLessThanOrEqual(metrics.action.left + 1);
    expect(metrics.action.right).toBeLessThanOrEqual(metrics.width);
    for (const card of metrics.cards) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(metrics.width + 1);
      expect(card.scroll).toBeLessThanOrEqual(card.client + 1);
    }
    expect(errors, `${lang} runtime`).toEqual([]);
    reports.push({ lang, ...metrics });
  }
  await artifact(page, testInfo, 'localized-chart-fit', reports);
});

test('complete saved chart reports every independent vote and honest per-chart coverage', async ({ page }, testInfo) => {
  await seed(page, fullSeed);
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await openAnalytics(page);
  await expect(dashboard(page)).toHaveAttribute('data-favorite-population', '224');
  const coverage: Record<string, unknown> = {};
  for (const dimension of ['type', 'color', 'shape', 'evolution']) {
    await expect(chart(page, dimension)).toHaveAttribute('data-favorite-covered', '224');
    await expect(chart(page, dimension)).toHaveAttribute('data-favorite-excluded', '0');
    await expect(chart(page, dimension).locator('svg')).toBeVisible();
    coverage[dimension] = { covered: 224, excluded: 0, rows: await chart(page, dimension).locator('[data-favorite-chart-row]').count() };
  }
  await expect(chart(page, 'bst')).toHaveAttribute('data-favorite-covered', '159');
  await expect(chart(page, 'bst')).toHaveAttribute('data-favorite-excluded', '0');
  await expect(chart(page, 'bst').locator('svg')).toBeVisible();
  await expect(chart(page, 'evolution').locator('[data-favorite-chart-row="baby"]')).toHaveCount(0);
  await expect(chart(page, 'evolution').locator('[data-favorite-chart-row="basic"]')).toHaveCount(1);
  const bstText = await chart(page, 'bst').innerText();
  const means = await chart(page, 'bst').locator('[data-mean-marker] text').allTextContents();
  expect(means).toEqual(expect.arrayContaining(['Your Avg 430.5', '443.7 Options Avg']));
  await artifact(page, testInfo, 'complete-live-coverage', { population: 224, coverage, bstText, originalCells: Object.keys(fullSeed).length });
});

test('Analytics retains the chosen chart sort and its scroll position across tab switches @viewport', async ({ page }, testInfo) => {
  await seed(page, fullSeed);
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await openAnalytics(page);
  await chart(page, 'type').locator('svg').getByText('COUNT', { exact: true }).click();
  const ordered = await chart(page, 'type').locator('[data-favorite-chart-row]').evaluateAll(rows => rows.map(row => ({ key: row.getAttribute('data-favorite-chart-row'), count: Number(row.querySelector('td')!.textContent) })));
  expect(ordered.map(row => row.count)).toEqual([...ordered.map(row => row.count)].sort((a, b) => b - a));
  const offset = await dashboard(page).evaluate(el => { el.scrollTop = 180; return el.scrollTop; });
  expect(offset).toBeGreaterThan(0);
  await picker(page).click();
  await analytics(page).click();
  expect(await dashboard(page).evaluate(el => el.scrollTop)).toBe(offset);
  expect(await chart(page, 'type').locator('[data-favorite-chart-row]').evaluateAll(rows => rows.map(row => ({ key: row.getAttribute('data-favorite-chart-row'), count: Number(row.querySelector('td')!.textContent) })))).toEqual(ordered);
  await artifact(page, testInfo, 'analytics-retained-sort-scroll', { offset, ordered });
});

test('chart identifiers stay distinct from counts and hidden chart data does not add blank page space @viewport', async ({ page }, testInfo) => {
  await seed(page, fullSeed);
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await openAnalytics(page);
  const metrics = await page.evaluate(() => {
    const gap = (dimension: string, header: string) => {
      const texts = [...document.querySelectorAll(`[data-favorite-chart="${dimension}"] svg text`)];
      const label = texts.find(el => el.textContent === header)!.getBoundingClientRect();
      const count = texts.find(el => el.textContent === 'COUNT')!.getBoundingClientRect();
      return count.left - label.right;
    };
    return { documentHeight: document.documentElement.scrollHeight, bodyHeight: document.body.getBoundingClientRect().height, typeGap: gap('type', 'TYPE'), shapeGap: gap('shape', 'SHAPE') };
  });
  expect(metrics.documentHeight).toBeLessThanOrEqual(Math.ceil(metrics.bodyHeight) + 1);
  expect(metrics.typeGap).toBeGreaterThanOrEqual(3);
  expect(metrics.shapeGap).toBeGreaterThanOrEqual(3);
  await artifact(page, testInfo, 'chart-header-space', metrics);
});

test('five Analytics charts form one ordered column with the Dex desktop reading width @viewport', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, fullSeed);
  await page.goto('/favorite-pokemon-picker?notme&lang=en');
  await openAnalytics(page);
  const measured = await dashboard(page).evaluate(el => {
    const container = el.firstElementChild!.getBoundingClientRect();
    const cards = [...el.querySelectorAll('[data-favorite-chart]')].map(card => {
      const box = card.getBoundingClientRect();
      return { name: card.getAttribute('data-favorite-chart'), left: box.left, top: box.top, bottom: box.bottom, width: box.width };
    });
    return { containerWidth: container.width, cards };
  });
  expect(measured.cards.map(card => card.name)).toEqual(['type', 'color', 'shape', 'evolution', 'bst']);
  for (const [index, card] of measured.cards.entries()) {
    expect(card.left).toBeCloseTo(measured.cards[0].left, 1);
    expect(card.width).toBeCloseTo(measured.cards[0].width, 1);
    if (index) expect(card.top).toBeGreaterThanOrEqual(measured.cards[index - 1].bottom + 1);
  }
  let dex: { containerWidth: number; cardWidth: number } | null = null;
  if (page.viewportSize()!.width >= 1024) {
    await page.goto(TUNE_URL);
    await seedDex(page);
    await page.locator('[data-nav="analytics"]').click();
    const heading = page.getByRole('heading', { name: 'Generation Origin' });
    await expect(heading).toBeVisible();
    dex = await page.locator('.max-w-6xl').filter({ has: heading }).evaluate(el => {
      const box = el.getBoundingClientRect(), css = getComputedStyle(el);
      return { containerWidth: box.width, cardWidth: box.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) };
    });
    expect(measured.containerWidth).toBeCloseTo(dex.containerWidth, 1);
    expect(measured.cards[0].width).toBeCloseTo(dex.cardWidth, 1);
  }
  await artifact(page, testInfo, 'single-chart-column', { measured, dex });
});
