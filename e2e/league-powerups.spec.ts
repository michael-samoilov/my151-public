import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

/**
 * Mega Evolution and Gigantamax on the champion and endgame boss rows.
 *
 * The rules are small but easy to get subtly wrong, so each one is driven:
 * where the buttons appear, that one button carries a Pokémon with two
 * Megas, and that a card holds one powerup at a time.
 */

const openCard = async (page: Page, slot: number) => {
  await blankLeague(page);
  await page.goto('/custom-gym-leader');
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
  test('the buttons stay circular', { tag: '@viewport' }, async ({ page }) => {
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');

    // The card scales itself with CSS `zoom`, so a 1rem box is a fractional
    // number of CSS pixels and the painted rect snaps its edges
    // independently. The right-anchored button measured 15px wide by 16px
    // tall, and `rounded-full` drew that as an ellipse. Paint containment
    // rasterises the element at subpixel precision instead.
    // The disc is what is drawn, and it is not the button: the button is a
    // larger, transparent press area around it.
    const discs = await page.evaluate(() =>
      [...document.querySelectorAll('[data-powerup]')].map((btn) => {
        const disc = btn.querySelector('[data-powerup-disc]')!;
        const r = disc.getBoundingClientRect();
        return {
          kind: btn.getAttribute('data-powerup'),
          ratio: +(r.width / r.height).toFixed(3),
          contain: getComputedStyle(disc).contain,
        };
      }),
    );
    expect(discs.length).toBeGreaterThan(0);
    for (const disc of discs) {
      expect(disc.ratio, `${disc.kind} box is square`).toBe(1);
      expect(disc.contain, `${disc.kind} keeps its own paint context`).toContain('paint');
    }
  });

  test('a press wide of the disc still toggles, and no two areas meet', { tag: '@viewport' }, async ({ page }) => {
    // The disc is 1rem so neighbouring seats' buttons cannot touch. That
    // leaves a 1rem target beside a tap that opens the line picker, so the
    // press area is larger than the paint — and no larger than the room.
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');
    await seat(page, '[data-testid="card-cell-1-2"]', 'lapras');

    const geometry = await page.evaluate(() => {
      const rects = [...document.querySelectorAll('[data-powerup]')].map((el) =>
        el.getBoundingClientRect(),
      );
      let tightest = Infinity;
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          tightest = Math.min(
            tightest,
            Math.max(
              Math.max(a.left - b.right, b.left - a.right),
              Math.max(a.top - b.bottom, b.top - a.bottom),
            ),
          );
        }
      }
      const hit = rects[0];
      const disc = document.querySelector('[data-powerup-disc]')!.getBoundingClientRect();
      return {
        areas: rects.length,
        growth: (hit.width * hit.height) / (disc.width * disc.height),
        tightest,
      };
    });
    expect(geometry.areas, 'every button has a press box').toBeGreaterThan(1);
    expect(geometry.growth, 'the press box is bigger than the disc').toBeGreaterThan(1.7);
    expect(geometry.tightest, 'no two press boxes meet').toBeGreaterThan(0);

    // The mis-tap this prevents: a press above the disc used to land on the
    // cell, which offers to replace the whole evolution line.
    const spot = await page.evaluate(() => {
      const cell = document.querySelector('[data-testid="card-cell-10-1"]')!;
      const button = cell.parentElement!.querySelector('[data-powerup="dynamax"]')!;
      const hit = button.getBoundingClientRect();
      const disc = button.querySelector('[data-powerup-disc]')!.getBoundingClientRect();
      return { x: disc.left + disc.width / 2, y: hit.top + 2, above: disc.top - hit.top - 2 };
    });
    expect(spot.above, 'the probe is clear of the disc').toBeGreaterThan(3);

    // Counted rather than asserted at zero: the desktop pane keeps a grid on
    // screen between picks, so "the picker opened" is a change in the grid.
    const before = await drawn(page, 10, 1);
    const tilesBefore = await page.locator('[data-testid="verify-evo-card"]').count();
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(600);
    expect(
      await page.locator('[data-testid="verify-evo-card"]').count(),
      'the line picker stays shut',
    ).toBe(tilesBefore);
    expect(await drawn(page, 10, 1), 'the powerup toggled').not.toBe(before);
  });

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
    // The first press filled the boss row too, and the second carries that
    // fill with it: a person who wanted Charizard Y on the team presses
    // the same button again, and both rows follow.
    expect(await drawn(page, 11, 1), 'the boss row followed to Y').toBe('Mega Charizard Y');
    await press(page, 10, 1, 'mega');
    expect(await drawn(page, 10, 1), 'the cycle returns to base').toBe('charizard');
    expect(await drawn(page, 11, 1), 'and so does the row it carried').toBe('charizard');

    await press(page, 10, 1, 'dynamax');
    expect(await drawn(page, 10, 1)).toBe('Gigantamax Charizard');
  });

  test('a row set apart keeps its own form', async ({ page }) => {
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');

    await press(page, 10, 1, 'mega'); // X on the champion and the boss
    await press(page, 11, 1, 'mega'); // the boss alone to Y
    expect(await drawn(page, 11, 1)).toBe('Mega Charizard Y');
    expect(await drawn(page, 10, 1), 'the champion stays on X').toBe('Mega Charizard X');
    // The boss no longer shows what the champion does, so the champion's
    // next press carries nothing.
    await press(page, 10, 1, 'dynamax');
    expect(await drawn(page, 10, 1)).toBe('Gigantamax Charizard');
    expect(await drawn(page, 11, 1), 'the boss keeps what it was given').toBe('Mega Charizard Y');
  });

  test('a second seat fills downward like the first', async ({ page }) => {
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');
    await seat(page, '[data-testid="card-cell-1-2"]', 'lapras');

    // With a Mega already on seat 1, the first press on seat 2 used to set
    // one row, which read as the second powerup working differently from
    // the first. Filling down is the seat's, not the card's.
    await press(page, 10, 1, 'mega');
    await press(page, 10, 2, 'dynamax');
    expect(await drawn(page, 10, 2)).toBe('Gigantamax Lapras');
    expect(await drawn(page, 11, 2), 'the boss row got it too').toBe('Gigantamax Lapras');
    expect(await drawn(page, 11, 1), 'seat 1 is untouched').toBe('Mega Charizard X');
  });

  test('the first press fills downward, and a press on the last row sets one', async ({ page }) => {
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');
    await seat(page, '[data-testid="card-cell-1-2"]', 'lapras');

    // A leader's Elite Four, champion and endgame teams are the same six
    // Pokémon at different strengths, so one press means the rows after it
    // too. Only the rows after it: the three run weakest to strongest, and a
    // Mega named on the champion says nothing about the Elite Four team the
    // player already went through.
    await press(page, 10, 1, 'mega');
    expect(await drawn(page, 10, 1)).toBe('Mega Charizard X');
    expect(await drawn(page, 9, 1), 'the elite four row is left alone').toBe('charizard');
    expect(await drawn(page, 11, 1), 'the endgame team got it too').toBe('Mega Charizard X');

    // A second seat *adds* rather than moving the first one's, so a whole
    // team can be powered up. On the last row there is nothing below to
    // fill.
    await press(page, 11, 2, 'dynamax');
    expect(await drawn(page, 11, 2)).toBe('Gigantamax Lapras');
    expect(await drawn(page, 11, 1), 'the boss row kept seat 1 as well').toBe('Mega Charizard X');
    expect(await drawn(page, 10, 1), 'the champion kept hers').toBe('Mega Charizard X');
    expect(await drawn(page, 10, 2), 'and gained nothing').toBe('lapras');
  });

  test('a press animates nothing on the disc', async ({ page }) => {
    // The ring and the symbol used to ease over 150ms, and for exactly those
    // nine frames every cross and reset on the rows below sat a device pixel
    // off, then dropped back: WebKit composites an element while it
    // transitions and re-rasterises what overlaps it. Measured on a phone
    // recording, and again on WebKitGTK with the transition slowed. The
    // state change is instant, so nothing is composited.
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll('[data-powerup-disc]')].flatMap((disc) => {
        const img = disc.querySelector('img');
        return [getComputedStyle(disc).transitionDuration, img ? getComputedStyle(img).transitionDuration : '0s'];
      }),
    );
    expect(durations.length, 'discs were drawn').toBeGreaterThan(0);
    expect(durations.every((d) => d === '0s'), `every disc and symbol has no transition: ${[...new Set(durations)].join(', ')}`).toBe(true);
  });

  test('a seat holds one powerup, but a row holds as many as it has seats', async ({ page }) => {
    await openCard(page, 12);
    await seat(page, '[data-testid="card-cell-1-1"]', 'charizard');
    await seat(page, '[data-testid="card-cell-1-2"]', 'lapras');

    await press(page, 10, 1, 'mega');
    expect(await buttons(page, 10, 1)).toEqual(['mega:true', 'dynamax:false']);

    // The other powerup on the same Pokémon replaces it: they are mutually
    // exclusive on one Pokémon.
    await press(page, 10, 1, 'dynamax');
    expect(await buttons(page, 10, 1)).toEqual(['mega:false', 'dynamax:true']);

    // Another seat adds its own. Both stay: a team where every Pokémon is
    // powered up is a card a person can build.
    await press(page, 10, 2, 'dynamax');
    expect(await buttons(page, 10, 1), 'seat 1 keeps its own').toEqual(['mega:false', 'dynamax:true']);
    expect(await buttons(page, 10, 2)).toEqual(['dynamax:true']);
    expect(await drawn(page, 10, 1)).toBe('Gigantamax Charizard');
    expect(await drawn(page, 10, 2)).toBe('Gigantamax Lapras');
  });
});
