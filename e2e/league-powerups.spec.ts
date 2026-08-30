import { expect, test, type Page } from '@playwright/test';

/**
 * Mega Evolution and Gigantamax on the champion and endgame boss rows.
 *
 * The rules are small but easy to get subtly wrong, so each one is driven:
 * where the buttons appear, that one button carries a Pokémon with two
 * Megas, and that a card holds one powerup at a time.
 */

const openCard = async (page: Page, slot: number) => {
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(500);
};

const seat = async (page: Page, cell: string, query: string) => {
  await page.click(cell);
  await page.waitForTimeout(600);
  await page.evaluate((q) => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForTimeout(800);
  await page.click('[data-testid="verify-evo-card"]');
  await page.waitForTimeout(500);
};

/** The alt text of a cell's sprite — the form's name once one is on. */
const drawn = (page: Page, row: number, seatNo: number) =>
  page.evaluate(
    ([r, s]) =>
      document.querySelector(`[data-testid="card-cell-${r}-${s}"] img`)?.getAttribute('alt') ?? null,
    [row, seatNo],
  );

const press = async (page: Page, row: number, seatNo: number, kind: 'mega' | 'dynamax') => {
  await page.evaluate(
    ([r, s, k]) => {
      const cell = document.querySelector(`[data-testid="card-cell-${r}-${s}"]`)!;
      (cell.parentElement!.querySelector(`[data-powerup="${k}"]`) as HTMLButtonElement).click();
    },
    [row, seatNo, kind] as [number, number, string],
  );
  await page.waitForTimeout(350);
};

const buttons = (page: Page, row: number, seatNo: number) =>
  page.evaluate(
    ([r, s]) => {
      const cell = document.querySelector(`[data-testid="card-cell-${r}-${s}"]`);
      return [...(cell?.parentElement?.querySelectorAll('[data-powerup]') ?? [])].map(
        (b) => `${b.getAttribute('data-powerup')}:${b.getAttribute('data-active')}`,
      );
    },
    [row, seatNo],
  );

test.describe('powerups', () => {
  test('only the champion and boss rows offer them, and only where a form exists', async ({ page }) => {
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');
    await seat(page, '[data-testid="card-cell-1-2"]', 'lapras');

    // Row 1 is a gym row: no powerups anywhere on it.
    expect(await buttons(page, 1, 1)).toEqual([]);
    // Charizard has Megas and a Gigantamax; Lapras only a Gigantamax.
    expect(await buttons(page, 10, 1)).toEqual(['mega:false', 'dynamax:false']);
    expect(await buttons(page, 10, 2)).toEqual(['dynamax:false']);
    expect(await buttons(page, 11, 1)).toEqual(['mega:false', 'dynamax:false']);
  });

  test('one button carries every form a Pokémon has, then returns to base', async ({ page }) => {
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');

    expect(await drawn(page, 10, 1)).toBe('charizard');
    await press(page, 10, 1, 'mega');
    expect(await drawn(page, 10, 1)).toBe('Mega Charizard X');
    await press(page, 10, 1, 'mega');
    expect(await drawn(page, 10, 1)).toBe('Mega Charizard Y');
    await press(page, 10, 1, 'mega');
    expect(await drawn(page, 10, 1), 'the cycle returns to base').toBe('charizard');

    // The boss row shows the same seat, so it shows the same form.
    await press(page, 10, 1, 'dynamax');
    expect(await drawn(page, 10, 1)).toBe('Gigantamax Charizard');
    expect(await drawn(page, 11, 1)).toBe('Gigantamax Charizard');
  });

  test('a card holds one powerup at a time', async ({ page }) => {
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');
    await seat(page, '[data-testid="card-cell-1-2"]', 'lapras');

    await press(page, 10, 1, 'mega');
    expect(await buttons(page, 10, 1)).toEqual(['mega:true', 'dynamax:false']);

    // The other powerup on the same Pokémon replaces it: they are mutually
    // exclusive on one Pokémon.
    await press(page, 10, 1, 'dynamax');
    expect(await buttons(page, 10, 1)).toEqual(['mega:false', 'dynamax:true']);

    // And another seat takes the card's single powerup with it.
    await press(page, 10, 2, 'dynamax');
    expect(await buttons(page, 10, 1)).toEqual(['mega:false', 'dynamax:false']);
    expect(await buttons(page, 10, 2)).toEqual(['dynamax:true']);
    expect(await drawn(page, 10, 1)).toBe('charizard');
    expect(await drawn(page, 10, 2)).toBe('Gigantamax Lapras');
  });
});
