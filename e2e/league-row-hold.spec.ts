import { expect, test } from '@playwright/test';

/**
 * A press and hold on a league row picks it up before any drag.
 *
 * Four things that has to mean, and none of them is visible in the markup:
 *
 * 1. the row is in hand after the hold alone, with the thumb still;
 * 2. the row in hand is drawn *in the slot it would fill*, centred on it —
 *    on the first frame that is the row it came from, and after that whichever
 *    row it is over;
 * 3. the copy is shorter than the row it came from, or it reaches a full row
 *    either side of the thumb and reads as displacing the row above as well;
 * 4. while held it shows the glyph and team size of the slot it is over, not
 *    the ones it came from — the question mid-drag is what this trainer would
 *    become there.
 *
 * Touch is dispatched through CDP because Playwright's own touch helpers do
 * not hold a contact still for a timed activation.
 */

test.describe('holding a league row', { tag: '@viewport' }, () => {
  test('picks it up, keeps it under the thumb, and previews the slot it is over',
    async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium', 'CDP touch injection');
      test.skip(testInfo.project.name === 'desktop', 'the hold is a touch affordance');

      await page.goto('/custom-gym-leader');
      await page.waitForSelector('[data-testid="league-slot-0"]');
      await page.waitForTimeout(500);

      const row = (await page.locator('[data-testid="league-slot-0"]').boundingBox())!;
      const target = (await page.locator('[data-testid="league-slot-3"]').boundingBox())!;
      const held = () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-drag-held]');
          if (!el) return null;
          const slot = el.closest('[data-testid^="league-slot-"]')!;
          const c = el.getBoundingClientRect();
          const s = slot.getBoundingClientRect();
          return {
            offCentre: Math.abs((c.top + c.height / 2) - (s.top + s.height / 2)),
            height: c.height,
            slotHeight: s.height,
            seats: el.querySelectorAll('img').length,
          };
        });

      const cdp = await page.context().newCDPSession(page);
      const x = row.x + row.width / 2;
      const y = row.y + row.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });

      // 1, 2 and 3: in hand on the hold alone, centred in its own slot, and shorter.
      await page.waitForTimeout(450);
      const still = await held();
      expect(still, 'the row is in hand after the hold, with no movement').not.toBeNull();
      expect(still!.offCentre, 'centred in the slot it would fill, from the first frame')
        .toBeLessThan(1.5);
      expect(still!.height, 'the copy is shorter than the row').toBeLessThan(row.height - 2);

      // 4: over a later slot it wears that slot's team size.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x, y: target.y + target.height / 2 }],
      });
      await page.waitForTimeout(300);
      const over = await held();
      expect(over!.offCentre, 'still centred, now on the row it is over').toBeLessThan(1.5);
      expect(over!.seats, 'it wears the team the slot it is over would give it')
        .toBeGreaterThan(still!.seats);

      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    });

  test('does not reorder neighbours on a hold alone', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'CDP touch injection');
    test.skip(testInfo.project.name === 'desktop', 'the hold is a touch affordance');

    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-5"]');
    await page.waitForTimeout(500);

    const rowTops = () =>
      page.evaluate(() => {
        const tops: number[] = [];
        for (let i = 0; i < 14; i++) {
          const el = document.querySelector(`[data-testid="league-slot-${i}"]`);
          tops.push(el?.getBoundingClientRect().top ?? 0);
        }
        return tops;
      });

    const before = await rowTops();
    const row = (await page.locator('[data-testid="league-slot-5"]').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const x = row.x + row.width / 2;
    const y = row.y + row.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(450);
    const during = await rowTops();
    expect(await page.locator('[data-drag-held]').count(), 'row is in hand').toBe(1);

    for (let i = 0; i < 14; i++) {
      if (i === 5) continue;
      expect(
        Math.abs(during[i] - before[i]),
        `slot ${i} should not shift on hold alone`,
      ).toBeLessThan(1);
    }

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
});
