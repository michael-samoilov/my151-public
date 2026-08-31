import { expect, test } from '@playwright/test';

/**
 * A press and hold on a league row picks it up before any drag.
 *
 * Four things that has to mean, and none of them is visible in the markup:
 *
 * 1. the row is in hand after the hold alone, with the thumb still;
 * 2. the copy stays *under* the thumb until the thumb travels, and moves
 *    *above* it once it does — holding is not yet a choice, so nothing has to
 *    be readable underneath; travelling is, so the target must not be hidden;
 * 3. the copy is shorter than the row it came from, or it reaches a full row
 *    either side of the thumb and reads as displacing the row above as well;
 * 4. while held it shows the glyph and team size of the slot it is over, not
 *    the ones it came from — the question mid-drag is what this trainer would
 *    become there.
 *
 * Touch is dispatched through CDP because Playwright's own touch helpers do
 * not hold a contact still for a timed activation.
 */

test.describe('holding a league row', () => {
  test('picks it up, keeps it under the thumb, and previews the slot it is over',
    async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium', 'CDP touch injection');
      test.skip(testInfo.project.name === 'desktop', 'the hold is a touch affordance');

      await page.goto('/pokemon-league-builder');
      await page.waitForSelector('[data-testid="league-slot-0"]');
      await page.waitForTimeout(500);

      const row = (await page.locator('[data-testid="league-slot-0"]').boundingBox())!;
      const target = (await page.locator('[data-testid="league-slot-3"]').boundingBox())!;
      const held = () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-drag-held]');
          if (!el) return null;
          const inner = el.firstElementChild!;
          return {
            placement: el.getAttribute('data-placement'),
            height: inner.getBoundingClientRect().height,
            seats: inner.querySelectorAll('img').length,
          };
        });

      const cdp = await page.context().newCDPSession(page);
      const x = row.x + row.width / 2;
      const y = row.y + row.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });

      // 1 and 3: held on the hold alone, and shorter than its own row.
      await page.waitForTimeout(450);
      const still = await held();
      expect(still, 'the row is in hand after the hold, with no movement').not.toBeNull();
      expect(still!.placement, 'and it stays under the thumb').toBe('on');
      expect(still!.height, 'the copy is shorter than the row').toBeLessThan(row.height - 2);

      // 2: travel lifts it clear of the thumb.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x, y: y + 30 }],
      });
      await page.waitForTimeout(250);
      expect((await held())!.placement, 'travel lifts it above the thumb').toBe('above');

      // 4: over a later slot it wears that slot's team size.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x, y: target.y + target.height / 2 }],
      });
      await page.waitForTimeout(300);
      const over = await held();
      expect(over!.seats, 'it wears the team the slot it is over would give it')
        .toBeGreaterThan(still!.seats);

      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    });
});
