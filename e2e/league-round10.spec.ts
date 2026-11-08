import { expect, test, type Page } from './support/test';
import { seededLeague } from './support/leagueSeed';

const openCard = async (page: Page, slot: number) => {
  await seededLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(400);
  await page.click(`[data-testid="league-slot-${slot}"]`);
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(900);
};

const stored = (page: Page, slot: number) =>
  page.evaluate(
    (i) => JSON.parse(window.localStorage.getItem('league-builder')!).state.cards[i],
    slot,
  );

test.describe('round 10', () => {
  test('a Pokémon name follows the language', async ({ page }) => {
    await openCard(page, 0);
    const signature = () =>
      page.evaluate(() => {
        const slot = document.querySelector('[data-testid="slot-ace"]');
        return (slot?.textContent ?? '').replace('ACE', '').replace('POKÉMON', '');
      });
    expect(await signature()).toContain('Onix');

    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.waitForTimeout(400);
    await page.locator('[role="menuitemradio"]:visible', { hasText: '日本語' }).first().click();
    await page.waitForTimeout(2500);

    const after = await signature();
    expect(after, 'the name is translated').toContain('イワーク');
    expect(after, 'the old English name is gone').not.toContain('Onix');
  });

  test('a powerup travels with its line, not its seat', async ({ page }) => {
    await openCard(page, 12);
    const CHAMPION_ROW = 10;
    type Pick = { seat: number };
    const rowPowerup = (card: {
      powerup?: Pick | null;
      powerups?: Record<string, Pick | Pick[] | null>;
    }): Pick | null => {
      const stored = card.powerups?.[String(CHAMPION_ROW)];
      if (Array.isArray(stored)) return stored[0] ?? null;
      return stored ?? card.powerup ?? null;
    };

    const before = await stored(page, 12);
    const seat = rowPowerup(before)!.seat;
    const line = before.lines[seat - 1].branch as number[];
    expect(seat, 'the seeded champion carries a Mega').toBeGreaterThan(0);

    const from = (await page.locator(`[data-testid="card-cell-10-${seat}"]`).boundingBox())!;
    const to = (await page.locator('[data-testid="card-cell-10-6"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(700);

    const after = await stored(page, 12);
    const moved = rowPowerup(after);
    expect(moved, 'the powerup is still on the card').not.toBeNull();
    expect(
      after.lines[moved!.seat - 1].branch,
      'and still on the line it was pressed for',
    ).toEqual(line);
  });

  test('the legendary can be removed without touching the lines', async ({ page }) => {
    await openCard(page, 13);
    type Pick = { pokemonId: number; seat: number };
    const legends = (card: { legend?: Pick | null; legends?: Pick[] }): Pick[] =>
      card.legends ?? (card.legend ? [card.legend] : []);

    const before = await stored(page, 13);
    expect(legends(before), 'the seeded boss has one').toHaveLength(1);

    const control = page.locator('button[aria-label="Remove the endgame boss legendary"]');
    expect(await control.count(), 'the legendary carries its own X').toBe(1);
    await control.click();
    await page.waitForTimeout(600);

    const after = await stored(page, 13);
    expect(legends(after), 'the legendary is gone').toHaveLength(0);
    expect(after.lines.length, 'every line stayed').toBe(before.lines.length);
    expect(after.lines, 'and none of them changed').toEqual(before.lines);
  });

  test('the story/rematch toggle switches the league summary', async ({ page }) => {
    await seededLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(700);

    const team = (slot: number) =>
      page.evaluate(
        (i) =>
          [...document.querySelectorAll(`[data-testid="league-slot-${i}"] img`)].filter((img) =>
            (img.getAttribute('src') ?? '').includes('/sprites/pokemon/'),
          ).length,
        slot,
      );
    const gym1 = await team(0);
    expect(gym1, 'gym 1 fields a small team on the way through').toBeLessThan(6);

    await page.locator('[data-league-view="rematch"]:visible').first().click();
    await page.waitForTimeout(600);

    expect(await team(0), 'the rematch fields the whole card').toBeGreaterThan(gym1);
    expect(
      await page.evaluate(() => JSON.parse(window.localStorage.getItem('league-builder')!).state.view),
      'and the choice is remembered',
    ).toBe('rematch');
  });
});
