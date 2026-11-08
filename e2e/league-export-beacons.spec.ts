import { expect, test, type Page } from './support/test';
import { seededLeague } from './support/leagueSeed';

type EventBody = { event?: string; exportTool?: string; reason?: string };
type LeagueBody = { kind?: string; exportKind?: string; events?: string[] };

async function collectEvents(page: Page): Promise<EventBody[]> {
  const events: EventBody[] = [];
  await page.route('**/api/event', async (route) => {
    if (route.request().method() === 'POST') {
      events.push(route.request().postDataJSON() as EventBody);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  return events;
}

async function collectLeague(page: Page): Promise<LeagueBody[]> {
  const posts: LeagueBody[] = [];
  await page.route('**/api/league', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON() as LeagueBody);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          highlight: { ordinal: 151, tool: 'league', firstPokemonId: 25 },
        }),
      });
      return;
    }
    await route.continue();
  });
  return posts;
}

function exportEvents(events: EventBody[]) {
  return events.filter((e) => e.event === 'league-export-league' || e.event === 'league-export-card');
}

async function confirmExport(page: Page) {
  await page.locator('[data-league-export-confirm]').waitFor({ timeout: 45_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45_000 }).catch(() => null),
    page.locator('[data-league-export-confirm]').click(),
  ]);
  await download?.cancel().catch(() => undefined);
}

test.describe('league export success beacons', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('league home share posts league-export-league after download', { tag: '@ci-smoke' }, async ({ page }, testInfo) => {
    const events = await collectEvents(page);
    const leaguePosts = await collectLeague(page);
    await seededLeague(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => false });
    });
    await page.goto('/custom-gym-leader');
    await page.locator('[data-testid="league-slot-0"]').waitFor();
    await page.getByRole('button', { name: 'Export league' }).click();
    await page.locator('[data-export-preview-layer] img').waitFor({ timeout: 45_000 });
    expect(exportEvents(events), 'must not fire on export-button click').toEqual([]);
    await confirmExport(page);
    await expect.poll(() => exportEvents(events)).toEqual([
      expect.objectContaining({
        event: 'league-export-league',
        exportTool: 'league',
      }),
    ]);
    await expect.poll(() => leaguePosts.filter((p) => p.kind === 'export')).toEqual([
      expect.objectContaining({ kind: 'export', exportKind: 'league' }),
    ]);
    await testInfo.attach('critical-journey', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('gym card share posts league-export-card after download', async ({ page }) => {
    const events = await collectEvents(page);
    const leaguePosts = await collectLeague(page);
    await seededLeague(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => false });
    });
    await page.goto('/custom-gym-leader');
    await page.locator('[data-testid="league-slot-0"]').waitFor();
    await page.locator('[data-testid="league-slot-0"]').click();
    await page.getByRole('button', { name: 'Export trainer card' }).click();
    await page.locator('[data-export-preview-layer] img').waitFor({ timeout: 45_000 });
    await confirmExport(page);
    await expect.poll(() => exportEvents(events)).toEqual([
      expect.objectContaining({
        event: 'league-export-card',
        exportTool: 'card',
      }),
    ]);
    await expect.poll(() => leaguePosts.filter((p) => p.kind === 'export')).toEqual([
      expect.objectContaining({ kind: 'export', exportKind: 'card' }),
    ]);
  });

  test('share AbortError does not post an export beacon', async ({ page }) => {
    const events = await collectEvents(page);
    const leaguePosts = await collectLeague(page);
    await seededLeague(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      });
      Object.defineProperty(navigator, 'canShare', { value: () => true });
      Object.defineProperty(navigator, 'share', {
        value: () => Promise.reject(new DOMException('Share canceled', 'AbortError')),
      });
    });
    await page.goto('/custom-gym-leader');
    await page.locator('[data-testid="league-slot-0"]').waitFor();
    await page.getByRole('button', { name: 'Export league' }).click();
    await page.locator('[data-export-preview-layer] img').waitFor({ timeout: 45_000 });
    await page.locator('[data-league-export-confirm]').click();
    await expect(page.locator('[data-league-export-confirm]')).toBeEnabled({ timeout: 10_000 });
    expect(exportEvents(events)).toEqual([]);
    expect(leaguePosts.filter((p) => p.kind === 'export')).toEqual([]);
  });
});
