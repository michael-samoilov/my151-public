import { expect, test } from '@playwright/test';

// platform: Playwright's touch helpers cannot hold a contact still for a timed activation, so touch goes through CDP.

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

      await page.waitForTimeout(450);
      const still = await held();
      expect(still, 'the row is in hand after the hold, with no movement').not.toBeNull();
      expect(still!.offCentre, 'centred in the slot it would fill, from the first frame')
        .toBeLessThan(1.5);
      expect(still!.height, 'the copy is shorter than the row').toBeLessThan(row.height - 2);

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
