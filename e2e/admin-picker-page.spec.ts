import { expect, test, type Locator, type Page } from '@playwright/test';
import { buildDashboard, type DashboardSource } from '../api/_dashboard';
import cellData from '../api/_favoriteCells.json' with { type: 'json' };
import { mergeFavoriteRecord, parseFavoriteSnapshot } from '../api/_favoriteRecord';

const MIN = 60_000;
const PLATFORM = { country: 'GB', region: 'ENG', device: 'Mobile', os: 'iOS', browser: 'Safari', tz: 'Europe/London', lang: 'en-GB', locale: 'en' };

/** One Picker chart, seen twice ten minutes apart. */
function picker(cid: string, fills: Record<string, number>, at: number) {
  const snapshot = parseFavoriteSnapshot({ v: 1, fills })!;
  const open = mergeFavoriteRecord(null, { cid, id: `${cid}-open`, now: at - 10 * MIN, kind: 'progress', snapshot, events: ['favorites-open'], ...PLATFORM });
  return mergeFavoriteRecord(open, { cid, id: `${cid}-pick`, now: at, kind: 'progress', snapshot, events: [], ...PLATFORM });
}

/**
 * Four charts. Fire × I: Charizard 3, Charmander 1. Water × I: Blastoise 2,
 * Squirtle 1. The server's own buildDashboard answers, so the counts and the
 * archived set run the real API code.
 */
async function stubPickerStore(page: Page) {
  const archived = new Set<string>();
  const posts: { cid: string; archived: boolean }[] = [];
  await page.route('**/api/submissions?**', (route) => {
    const now = Date.now();
    const charts = [
      picker('e2e-pick-a', { 'fire|1': 6, 'water|1': 9, 'starter|1': 6, 'favorite|1': 6 }, now - 1 * MIN),
      picker('e2e-pick-b', { 'fire|1': 6, 'water|1': 7, 'starter|1': 4 }, now - 2 * MIN),
      picker('e2e-pick-c', { 'fire|1': 6, 'water|1': 9 }, now - 3 * MIN),
      picker('e2e-pick-d', { 'fire|1': 4 }, now - 4 * MIN),
    ];
    const dex = {
      cid: 'e2e-pick-a', firstTs: now - 20 * MIN, firstAt: new Date(now - 20 * MIN).toISOString(), lastTs: now - MIN, lastAt: new Date(now - MIN).toISOString(),
      submits: 2, sessions: 1, sessionMs: [10 * MIN], sessionLog: [{ ts: now - MIN, ids: [1, 4, 7] }], maxDepth: 3, localHour: 12,
      everIds: [1, 4, 7], latestIds: [1, 4, 7], completed: false, exported: true, ...PLATFORM,
    };
    const league = {
      cid: 'e2e-pick-a', firstTs: now - 20 * MIN, firstAt: new Date(now - 20 * MIN).toISOString(), lastTs: now - MIN, lastAt: new Date(now - MIN).toISOString(),
      submits: 2, sessions: 1, curSessionStart: now - MIN, maxSessionMs: 10 * MIN, sessionMs: [10 * MIN], sessionLog: [{ ts: now - MIN }],
      maxCards: 14, maxSeats: 14, latest: { cards: 14, seats: 14, typed: 0, named: 0, aces: 0, leagueNamed: false }, exportsCard: 1, exportsLeague: 0, ...PLATFORM,
    };
    const source: DashboardSource = {
      clients: { [dex.cid]: JSON.stringify(dex) },
      archived: [...archived],
      funnel: {},
      funnelWindow: null,
      leagueClients: { [league.cid]: JSON.stringify(league) },
      favoriteClients: Object.fromEntries(charts.map((r) => [r.cid, JSON.stringify(r)])),
    };
    return route.fulfill({ json: buildDashboard(source, { range: 'all' }, now) });
  });
  await page.route('**/api/archive-entry', (route) => {
    const body = route.request().postDataJSON() as { cid: string; archived: boolean };
    posts.push(body);
    if (body.archived) archived.add(body.cid);
    else archived.delete(body.cid);
    return route.fulfill({ json: { ok: true, ...body } });
  });
  await page.route('**/api/search-performance**', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.addInitScript(() => {
    localStorage.setItem('p151-admin-token', 'e2e');
    localStorage.setItem('p151-admin-range', 'all');
    if (!localStorage.getItem('p151-admin-tool')) localStorage.setItem('p151-admin-tool', 'favorites');
  });
  await page.goto('/?admin');
  return posts;
}

async function chooseStatus(page: Page, label: 'Active' | 'Archived') {
  await page.getByRole('button', { name: 'Archive filter' }).click();
  await page.getByRole('option', { name: label }).click();
}

test('a Picker row archives by its browser id, then restores', async ({ page }, testInfo) => {
  const posts = await stubPickerStore(page);
  const row = page.locator('[data-favorite-user="e2e-pick-a"]');
  await expect(row.locator('[data-metric="picker"]')).toHaveText('4/257 Favs');
  await row.getByRole('button', { name: 'Archive user' }).click();
  await expect(row).toHaveCount(0);
  await chooseStatus(page, 'Archived');
  await expect(row.getByRole('button', { name: 'Unarchive user' })).toBeVisible();
  const archivedShot = await page.screenshot();
  await row.getByRole('button', { name: 'Unarchive user' }).click();
  await chooseStatus(page, 'Active');
  await expect(row.getByRole('button', { name: 'Archive user' })).toBeVisible();
  expect(posts).toEqual([
    { cid: 'e2e-pick-a', archived: true },
    { cid: 'e2e-pick-a', archived: false },
  ]);
  await testInfo.attach('picker-archive-posts.json', { body: JSON.stringify(posts), contentType: 'application/json' });
  await testInfo.attach('picker-archived-row.png', { body: archivedShot, contentType: 'image/png' });
});

/** The Pokémon a pick cell allows, as the server validates them. */
const allowed = (key: string) => [...new Set((cellData as Record<string, { ids?: number[] }>)[key].ids)].sort((a, b) => a - b);

/** Where the grid sits in its frame, and the selector's order and counts. */
async function measure(page: Page, selector: Locator) {
  const grid = await page.getByTestId('favorites-grid').boundingBox();
  const frame = await page.getByTestId('favorites-grid-scroll').boundingBox();
  const fits = await page.getByTestId('favorites-grid-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  const tiles = await selector.locator('[data-testid^="favorites-pick-"]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-testid')!.slice('favorites-pick-'.length))));
  const counts = await selector.locator('[data-pick-count]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-pick-count'))));
  const bars = await selector.locator('[data-pick-bar]').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.width));
  return { grid, frame, fits, tiles, counts, bars, viewport: page.viewportSize() };
}

test.describe('Picker Most picked @viewport', () => {
  test('the wide grid shows each cell top pick, and each cell kind opens its count-ranked selector', async ({ page }, testInfo) => {
    await stubPickerStore(page);
    const preview = page.locator('section').filter({ has: page.getByRole('heading', { name: 'What people pick' }) });
    await expect(preview).toContainText('of 4 charts');
    await preview.getByRole('button', { name: 'Most picked ›' }).click();
    await expect(page.getByTestId('favorites-cell-fire-1')).toHaveAttribute('aria-label', /Charizard$/);
    await expect(page.getByTestId('favorites-cell-water-1')).toHaveAttribute('aria-label', /Blastoise$/);
    // The type axis runs across at every width, as in the app.
    const normal = await page.getByTestId('favorites-cell-normal-1').boundingBox();
    const favorite = await page.getByTestId('favorites-cell-favorite-1').boundingBox();
    expect(Math.abs(normal!.y - favorite!.y)).toBeLessThan(1);
    await page.getByTestId('favorites-cell-fire-1').click();
    const selector = page.getByTestId('favorites-picker');
    await expect(page.getByTestId('admin-pick-summary')).toHaveText('4 of 4 charts');
    const m = await measure(page, selector);
    // A pick cell lists every Pokémon it allows; the unpicked ones show 0.
    expect([...m.tiles].sort((a, b) => a - b)).toEqual(allowed('fire|1'));
    expect(m.tiles.slice(0, 2)).toEqual([6, 4]);
    expect(m.counts.slice(0, 2)).toEqual([3, 1]);
    expect(m.counts.slice(2).every((n) => n === 0)).toBe(true);
    await expect(selector.locator('[data-unpicked]')).toHaveCount(m.tiles.length - 2);
    expect(parseFloat(m.bars[0])).toBe(100);
    expect(parseFloat(m.bars[1])).toBeCloseTo(100 / 3, 1);
    await expect(selector.getByTestId('favorites-type-icon')).toHaveCount(0);
    // The grid fits the frame's height. A desktop grid fits its width too.
    expect(m.grid!.y + m.grid!.height).toBeLessThanOrEqual(m.frame!.y + m.frame!.height + 1);
    if (m.viewport!.width >= 1024) expect(m.fits).toBe(true);
    // A grid that fits is centered; one that scrolls sideways starts at the frame's left edge.
    const leftGap = m.grid!.x - m.frame!.x;
    if (m.fits) expect(Math.abs(leftGap - (m.frame!.x + m.frame!.width - m.grid!.x - m.grid!.width))).toBeLessThanOrEqual(1);
    else expect(Math.abs(leftGap)).toBeLessThanOrEqual(0.5);
    await testInfo.attach('picker-most-picked.json', { body: JSON.stringify(m), contentType: 'application/json' });
    await testInfo.attach('picker-most-picked.png', { body: await page.screenshot(), contentType: 'image/png' });

    // A pointer cell offers each chart its own picks, so it lists only what charts hold.
    await page.keyboard.press('Escape');
    await expect(selector).toHaveCount(0);
    await page.getByTestId('favorites-cell-favorite-1').click();
    await expect(page.getByTestId('admin-pick-summary')).toHaveText('1 of 4 charts');
    const pointer = await measure(page, selector);
    expect(pointer.tiles).toEqual([6]);
    expect(pointer.counts).toEqual([1]);
    await testInfo.attach('picker-most-picked-pointer.png', { body: await page.screenshot(), contentType: 'image/png' });

    // A ctrl+wheel zoom from the centered grid keeps the cell under the pointer.
    if (!m.fits) return;
    await page.keyboard.press('Escape');
    await expect(selector).toHaveCount(0);
    const box = (await page.getByTestId('favorites-cell-psychic-5').boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.keyboard.down('Control');
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -50);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('favorites-grid-scroll')).toHaveAttribute('data-zoom', '2.5');
    const under = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-testid^="favorites-cell-"]')?.getAttribute('data-testid'), [x, y]);
    expect(under).toBe('favorites-cell-psychic-5');
  });
});

test.describe('Newest browsers chip fit @viewport', () => {
  test('the Dex rows refit their chips after the Picker rows', async ({ page }, testInfo) => {
    await stubPickerStore(page);
    await expect(page.locator('[data-favorite-user]').first()).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Admin section' });
    await nav.getByRole('button', { name: 'Dex', exact: true }).click();
    await expect(page.locator('[data-user-preview] [data-metric="league"]').first()).toBeVisible();
    const zoom = () => page.locator('[data-preview-chip-zoom]').getAttribute('data-preview-chip-zoom');
    const afterPicker = await zoom();
    await page.reload();
    await expect(page.locator('[data-user-preview] [data-metric="league"]').first()).toBeVisible();
    const fresh = await zoom();
    expect(afterPicker).toBe(fresh);
    await testInfo.attach('chip-zoom.json', { body: JSON.stringify({ afterPicker, fresh }), contentType: 'application/json' });
    await testInfo.attach('dex-rows.png', { body: await page.screenshot(), contentType: 'image/png' });
  });
});
