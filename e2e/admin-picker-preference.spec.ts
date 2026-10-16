import { openAdmin } from './admin-ready';
import { expect, test, type Page } from '@playwright/test';
import { buildDashboard, type DashboardSource } from '../api/_dashboard';
import type { FavoritePicks } from '../api/_favoriteAggregate';
import { mergeFavoriteRecord, parseFavoriteSnapshot } from '../api/_favoriteRecord';

type Preference = NonNullable<FavoritePicks['preference']>;
const NOW = Date.UTC(2026, 9, 11, 12);
const PLATFORM = { country: 'GB', region: 'ENG', device: 'Mobile', os: 'iOS', browser: 'Safari', tz: 'Europe/London', lang: 'en-GB', locale: 'en' };

const preference: Preference = {
  entries: [
    { id: 7, score: 2, picks: 2, charts: 1, component: 0, evidencePicks: 2 },
    { id: 6, score: 1, picks: 3, charts: 3, component: 0, evidencePicks: 3 },
    { id: 4, score: null, picks: 1, charts: 1, component: null, evidencePicks: 0 },
  ],
  choices: 5, charts: 3, candidates: 20, components: 1,
  converged: true, gradientResidual: 0, iterations: 8, regularization: 1,
};

async function openPicks(page: Page, model: Preference | null = preference, expectedPreviewIds = ['7', '6']) {
  const fills = [
    { 'fire|1': 6, 'water|1': 7, 'starter|1': 7 },
    { 'fire|1': 6 },
    { 'fire|1': 6 },
    { 'fire|1': 4 },
  ];
  const records = fills.map((fill, index) => mergeFavoriteRecord(null, {
    cid: `preference-${index}`, id: `preference-${index}-open`, now: NOW - (index + 1) * 60_000,
    kind: 'progress', snapshot: parseFavoriteSnapshot({ v: 1, fills: fill })!,
    events: ['favorites-open'], ...PLATFORM,
  }));
  const source: DashboardSource = {
    clients: {}, archived: [], funnel: {}, funnelWindow: null, leagueClients: {},
    favoriteClients: Object.fromEntries(records.map((record) => [record.cid, JSON.stringify(record)])),
  };
  await page.route('**/api/submissions?**', (route) => {
    const dashboard = buildDashboard(source, { range: 'all' }, NOW);
    dashboard.favoritePicks.preference = model ?? undefined;
    return route.fulfill({ json: dashboard });
  });
  await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.addInitScript(() => {
    localStorage.setItem('p151-admin-token', 'e2e');
    localStorage.setItem('p151-admin-range', 'all');
    localStorage.setItem('p151-admin-tool', 'favorites');
  });
  await openAdmin(page, '/?admin');
  const preview = page.locator('section').filter({ has: page.getByRole('heading', { name: 'What people pick' }) });
  if (model?.converged && model.choices > 0) {
    await expect(preview.locator('img')).toHaveCount(expectedPreviewIds.length);
    const previewIds = await preview.locator('img').evaluateAll((images) => images.map((image) => image.parentElement!.parentElement!.getAttribute('title')!.match(/^#(\d+)/)![1]));
    expect(previewIds).toEqual(expectedPreviewIds);
    await expect(preview).toContainText('2.0×');
  } else {
    await expect(preview.locator('img')).toHaveCount(0);
    await expect(preview).toContainText('Preference strength unavailable.');
  }
  await preview.getByRole('button', { name: 'Preference strength ›' }).click();
}

test.describe('Picker preference strength @viewport', () => {
  test('previews score order, opens the ranking, and keeps the grid selector available', async ({ page }, testInfo) => {
    await openPicks(page);
    await expect(page.getByRole('button', { name: 'Preference strength', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await expect(page.getByTestId('favorites-cell-fire-1')).toHaveAttribute('aria-label', /Charizard$/);
    await page.getByTestId('favorites-cell-fire-1').click();
    await expect(page.getByTestId('admin-pick-summary')).toHaveText('4 of 4 charts');
    if (page.viewportSize()!.width < 1024) await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Preference strength', exact: true }).click();
    await expect(page.getByTestId('admin-pick-summary')).toHaveCount(0);
    const ranking = page.getByTestId('admin-picker-preference');
    await expect(ranking.getByTestId('favorites-pretty-grid')).toBeVisible();
    const rows = await ranking.locator('[data-preference-id]').evaluateAll((elements) => elements.map((element) => ({
      id: Number(element.getAttribute('data-preference-id')),
      text: element.textContent,
    })));
    expect(rows.map((row) => row.id)).toEqual([7, 6, 4]);
    await expect(ranking.locator('[data-preference-id="7"]')).toHaveText('2.0×2 picks1 chart');
    await expect(ranking.locator('[data-preference-id="6"]')).toHaveText('1.0×3 picks3 charts');
    await expect(ranking.locator('[data-preference-id="4"]')).toHaveText('—1 pick1 chart');
    await expect(ranking.getByTestId('favorites-type-icon')).toHaveCount(0);
    await expect(page.getByText(/A Pokémon scoring n× is estimated/)).toBeHidden();
    await page.getByText('What does the number mean?', { exact: true }).click();
    await expect(page.getByText(/A Pokémon scoring n× is estimated/)).toBeVisible();
    await expect(ranking).toContainText('67% versus 33%');
    await expect(ranking).toContainText('when both are offered in the same selector');
    await expect(ranking.locator('details p')).toHaveCount(1);
    const fits = await ranking.getByTestId('favorites-pretty-grid').evaluate((grid) => {
      const host = grid.parentElement!;
      return grid.getBoundingClientRect().width <= host.clientWidth + 1;
    });
    expect(fits).toBe(true);
    await testInfo.attach('preference-ranking.json', { body: JSON.stringify({ rows, fits, viewport: page.viewportSize() }), contentType: 'application/json' });
    await testInfo.attach('preference-ranking.png', { body: await page.screenshot(), contentType: 'image/png' });
    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await expect(page.getByTestId('favorites-cell-fire-1')).toBeVisible();
    await expect(page.getByTestId('admin-pick-summary')).toHaveCount(0);
  });

  test('warns when groups lack direct comparisons and fits sparse large counts', async ({ page }, testInfo) => {
    await openPicks(page, {
      ...preference, components: 2,
      entries: [
        ...preference.entries.map((entry, index) => ({
          ...entry, picks: index === 0 ? 12345 : entry.picks,
          charts: index === 0 ? 1234 : entry.charts, component: index === 1 ? 1 : entry.component,
        })),
        ...[1, 2, 3, 8, 9].map((id) => ({ id, score: 0.5, picks: 1, charts: 1, component: 1, evidencePicks: 1 })),
      ],
    }, ['7', '6', '1', '2', '3', '8', '9']);
    await page.getByRole('button', { name: 'Preference strength', exact: true }).click();
    const ranking = page.getByTestId('admin-picker-preference');
    await expect(ranking).toContainText('Comparisons between these groups depend on smoothing.');
    const caption = ranking.locator('[data-preference-id="7"]');
    await expect(caption).toHaveAttribute('title', /12345 picks · 1234 charts/);
    const fit = await caption.evaluate((element) => [...element.querySelectorAll('span')].every((span) => span.scrollWidth <= span.clientWidth + 1));
    expect(fit).toBe(true);
    const gridFits = await ranking.getByTestId('favorites-pretty-grid').evaluate((grid) => grid.getBoundingClientRect().width <= grid.parentElement!.clientWidth + 1);
    expect(gridFits).toBe(true);
    await testInfo.attach('preference-sparse-fit.json', { body: JSON.stringify({ fit, gridFits, viewport: page.viewportSize() }), contentType: 'application/json' });
    await testInfo.attach('preference-sparse-fit.png', { body: await page.screenshot(), contentType: 'image/png' });
  });
});

for (const scenario of [
  { name: 'missing model', model: null, message: 'Preference strength is unavailable for this data.' },
  { name: 'singleton-only picks', model: { ...preference, choices: 0, entries: preference.entries.map((entry) => ({ ...entry, score: null, component: null, evidencePicks: 0 })) }, message: 'No filled cells offered a comparison.' },
  { name: 'failed fit', model: { ...preference, converged: false }, message: 'The estimate did not settle, so strength numbers are unavailable.' },
]) {
  test(`shows unavailable instead of invented zero scores for ${scenario.name}`, async ({ page }, testInfo) => {
    await openPicks(page, scenario.model);
    await page.getByRole('button', { name: 'Preference strength', exact: true }).click();
    const ranking = page.getByTestId('admin-picker-preference');
    await expect(ranking).toContainText(scenario.message);
    await expect(ranking.locator('[data-preference-score]')).toHaveCount(0);
    await expect(ranking).not.toContainText('0.0×');
    await testInfo.attach(`preference-${scenario.name.replaceAll(' ', '-')}.png`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}
