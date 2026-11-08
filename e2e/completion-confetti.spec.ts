import { expect, test, type Page, type TestInfo } from './support/test';
import { bursts, settledBursts, watchConfetti, type Burst } from './support/confetti';
import { favoritesBoard, pickLastCell, seedFavorites } from './support/favoritesBoard';
import { oneLineShortLeague } from './support/leagueSeed';

async function stubApi(page: Page) {
  await page.route('**/api/**', (route) => route.fulfill({ json: { ok: true } }));
}

function expectStickerBurst(found: Burst[], dpr: number) {
  expect(found).toHaveLength(1);
  expect(found[0].scale, 'canvas pixels per CSS pixel').toBe(dpr);
  expect(found[0].types?.length ?? 0, `type colors drawn: ${found[0].types}`).toBeGreaterThanOrEqual(12);
}

async function reloadAndAttach(page: Page, testInfo: TestInfo, seen: Burst[]) {
  await page.reload();
  await page.waitForTimeout(3000);
  const afterReload = (await bursts(page)).length;
  await testInfo.attach('completion-confetti.json', {
    body: JSON.stringify({
      bursts: seen.length,
      canvasScale: seen[0]?.scale,
      typeColorsAtLeast12: (seen[0]?.types?.length ?? 0) >= 12,
      burstsAfterReload: afterReload,
    }, null, 2),
    contentType: 'application/json',
  });
  expect(afterReload, 'bursts after a reload').toBe(0);
}

async function seatSixthLine(page: Page, slot: number) {
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="card-cell-11-6"]');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, 'eevee');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  await page.click('[data-testid="verify-evo-card"]');
}

async function openDexAt150(page: Page) {
  await page.addInitScript(() => localStorage.setItem('p151-league-promo-seen', '1'));
  await page.goto('/pokedex-builder?tune&lang=en');
  await page.waitForFunction(() => '__pokedexStore' in window);
  await placeDex(page, 150, { milestoneMax: 150, milestoneCelebrated: [25, 50, 100], milestoneCelebration: null });
  await expect(page.getByTestId('tool-title')).toContainText('150/151');
}

async function placeDex(page: Page, count: number, extra: Record<string, unknown> = {}) {
  await page.evaluate(({ count, extra }) => {
    const store = (window as unknown as { __pokedexStore: {
      getState: () => { sections: Record<string, number[]> };
      setState: (patch: Record<string, unknown>) => void;
    } }).__pokedexStore;
    store.setState({ sections: { ...store.getState().sections, other: Array.from({ length: count }, (_, i) => i + 1) }, ...extra });
  }, { count, extra });
}

const dexPopup = (page: Page) => page.getByRole('status').filter({ hasText: 'Your 151 is complete!' });
const leagueNudge = (page: Page) => page.getByRole('status').filter({ hasText: 'All 14 teams are full!' });

test.describe('completion confetti', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the Pokédex Maker bursts type stickers once at 151', async ({ page }, testInfo) => {
    await stubApi(page);
    await watchConfetti(page);
    await openDexAt150(page);
    await placeDex(page, 151);
    await expect(dexPopup(page)).toBeVisible();
    const seen = await settledBursts(page);
    expectStickerBurst(seen, 2);
    // platform: canvas-confetti counts frames, not time, so the test waits for the canvas to go.
    await expect(page.getByTestId('completion-confetti')).toHaveCount(0, { timeout: 20_000 });
    expect(await bursts(page), 'still one burst').toHaveLength(1);
    await reloadAndAttach(page, testInfo, seen);
  });

  test('the Favorite Pokémon Picker bursts once when the grid fills', async ({ page }, testInfo) => {
    await stubApi(page);
    await watchConfetti(page);
    await seedFavorites(page, favoritesBoard(true));
    await page.goto('/favorite-pokemon-picker?lang=en');
    await expect(page.getByTestId('favorites-completion')).toHaveText('256/257');
    await pickLastCell(page);
    await expect(page.getByTestId('favorites-completion')).toHaveText('257/257');
    const seen = await settledBursts(page);
    expectStickerBurst(seen, 2);
    await reloadAndAttach(page, testInfo, seen);
  });

  test('the League Maker bursts on desktop, with its export tooltip, once the picker closes', async ({ page }, testInfo) => {
    await stubApi(page);
    await watchConfetti(page);
    await oneLineShortLeague(page, 13);
    await page.goto('/custom-gym-leader?lang=en');
    await seatSixthLine(page, 13);
    await page.waitForTimeout(1500);
    expect(await bursts(page), 'no burst while the picker is open').toHaveLength(0);
    await page.getByTestId('browser-close').click();
    const seen = await settledBursts(page);
    expectStickerBurst(seen, 2);
    await expect(leagueNudge(page)).toBeVisible();
    await reloadAndAttach(page, testInfo, seen);
  });
});

test.describe('completion confetti on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('the League Maker waits until the person is back on the summary', async ({ page }, testInfo) => {
    await stubApi(page);
    await watchConfetti(page);
    await oneLineShortLeague(page, 13);
    await page.goto('/custom-gym-leader?lang=en');
    await seatSixthLine(page, 13);
    await page.waitForTimeout(2000);
    expect(await bursts(page), 'no burst over the open card').toHaveLength(0);
    await page.getByRole('button', { name: /Back to the league/ }).click();
    const seen = await settledBursts(page);
    expectStickerBurst(seen, 3);
    await expect(leagueNudge(page)).toBeVisible();
    await reloadAndAttach(page, testInfo, seen);
  });
});

test.describe('completion confetti under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the Pokédex Maker shows its popup at 151 with no burst', async ({ page }, testInfo) => {
    await stubApi(page);
    await watchConfetti(page);
    await openDexAt150(page);
    await placeDex(page, 151);
    await expect(dexPopup(page)).toBeVisible();
    await page.waitForTimeout(1500);
    const found = await bursts(page);
    await testInfo.attach('reduced-motion.json', { body: JSON.stringify({ popup: true, bursts: found.length }), contentType: 'application/json' });
    expect(found).toHaveLength(0);
  });
});
