import { expect, test, type Page } from './support/test';
import { blankLeague } from './support/leagueSeed';

const search = async (page: Page, query: string) => {
  await page.evaluate((q) => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForTimeout(700);
};

const drawn = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="verify-evo-card"]')].map((tile) => {
      const img = [...tile.querySelectorAll('img')].find((i) =>
        (i.getAttribute('src') ?? '').includes('/sprites/pokemon/'),
      );
      return img?.getAttribute('alt') ?? '(none)';
    }),
  );

const chevrons = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid="verify-evo-card"]')].reduce(
        (n, tile) =>
          n + (tile.parentElement?.querySelectorAll('svg.lucide-chevron-right').length ?? 0),
        0,
      ),
  );

const reported = (page: Page) =>
  page.locator('[data-result-count]').first().getAttribute('data-result-count');

const signatureAlt = (page: Page) =>
  page.evaluate(() => {
    const btn = document.querySelector('[data-testid="slot-ace"]');
    return btn?.querySelector('img')?.getAttribute('alt') ?? '(empty)';
  });

const pickSignature = async (page: Page, query: string, name: string) => {
  await page.click('[data-testid="slot-ace"]');
  await page.waitForTimeout(800);
  await search(page, query);
  const index = (await drawn(page)).indexOf(name);
  expect(index, `a tile for ${name}`).toBeGreaterThanOrEqual(0);
  await page.evaluate(
    (i) => (document.querySelectorAll('[data-testid="verify-evo-card"]')[i] as HTMLElement).click(),
    index,
  );
  await page.waitForTimeout(700);
};

const openCard = async (page: Page, slot: number) => {
  await blankLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(400);
};

const seatOne = async (page: Page, query: string) => {
  await page.click('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(500);
  await search(page, query);
  await page.click('[data-testid="verify-evo-card"]');
  await page.waitForTimeout(500);
};

test.describe('one-Pokémon pickers', () => {
  test('the signature picker draws a split chain once', async ({ page }) => {
    await openCard(page, 0);
    await seatOne(page, 'pikachu');
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="slot-ace"]');
      (btn as HTMLButtonElement).click();
    });
    await page.waitForTimeout(800);

    await search(page, 'eevee');
    const tiles = await drawn(page);
    expect(new Set(tiles).size, 'no Pokémon twice').toBe(tiles.length);
    expect(tiles).toContain('Eevee');
    expect(tiles).toContain('Sylveon');
    expect(await reported(page), 'the count agrees with the grid').toBe(String(tiles.length));
    expect(await chevrons(page), 'no evolution arrows between standalone tiles').toBe(0);
  });

  test('the legendary picker draws a split chain once', async ({ page }) => {
    await openCard(page, 13);
    await seatOne(page, 'pikachu');
    await page.click('[data-testid="card-cell-11-1"]');
    await page.waitForTimeout(800);

    await search(page, 'cosmog');
    expect(await drawn(page)).toEqual(['Cosmog', 'Cosmoem', 'Solgaleo', 'Lunala']);
    expect(await chevrons(page)).toBe(0);
  });

  test('the signature slot shows the Pokémon that was tapped', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'narrow',
      '1× at dpr 1 is 96 CSS px; two squares overlap a 320 pane',
    );
    await openCard(page, 0);
    await seatOne(page, 'geodude');

    await pickSignature(page, 'geodude', 'Geodude');
    expect(await signatureAlt(page)).toBe('geodude');

    await pickSignature(page, 'geodude', 'Graveler');
    expect(await signatureAlt(page)).toBe('graveler');

    await pickSignature(page, 'geodude', 'Golem');
    expect(await signatureAlt(page)).toBe('golem');
    await testInfo.attach('signature-and-team', {
      body: JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('league-builder')!).state.cards[0])),
      contentType: 'application/json',
    });
  });

  test('the line picker keeps its chevrons and its branches', async ({ page }) => {
    await openCard(page, 0);
    await page.click('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);
    await search(page, 'scyther');
    const tiles = await drawn(page);
    expect(tiles.filter((n) => n === 'Scyther').length).toBeGreaterThan(1);
    expect(await chevrons(page), 'a line still shows what evolves into what').toBeGreaterThan(0);
  });
});
