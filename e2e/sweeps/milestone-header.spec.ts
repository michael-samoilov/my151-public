import { expect, test } from '@playwright/test';
import {
  gotoPage,
  measureHeader,
  NAV_PAGES,
  seedDex,
  TUNE_URL,
  type HeaderMetrics,
} from '../support/milestoneHeader';

/**
 * The milestone bar shares its header row with the `n/151` counter on its left
 * and the page's controls on its right. That row is the tightest horizontal
 * budget in the app, which makes it the first thing longer translated labels
 * will break — so it is measured across the full width range rather than only
 * at the project viewports.
 *
 * Replaces the two root-level `.mjs` harnesses. The former `test-milestone-bar`
 * one is gone entirely: it navigated with a `?view=` param the app never read
 * (so it silently measured the Builder page three times), asserted a
 * `clamp(10.5rem, 24vw, 22rem)` width rule that no longer exists anywhere in
 * src/, and never set a non-zero exit code, so it could not fail.
 */

/** The bar must fill most of the space between the counter and the controls. */
const MIN_FILL = 0.8;

const VIEWPORTS = [
  { label: 'mobile-390', width: 390, height: 844 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-md-1024', width: 1024, height: 768 },
  { label: 'desktop-lg-1440', width: 1440, height: 900 },
  { label: 'desktop-xl-1920', width: 1920, height: 1080 },
];

function fillRatio(m: HeaderMetrics): number {
  const availLeft = m.counter ? m.counter.right : m.row.left;
  const availRight = m.control ? m.control.left : m.row.right;
  const avail = availRight - availLeft;
  return avail > 0 ? m.bar.width / avail : 0;
}

for (const vp of VIEWPORTS) {
  test.describe(`milestone header @ ${vp.label}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const nav of NAV_PAGES) {
      test(`${nav}: counter, bar and controls are ordered, gapped and filled`, async ({ page }) => {
        await page.goto(TUNE_URL);
        await seedDex(page);
        await gotoPage(page, nav);

        const m = await measureHeader(page);

        // Same row — guards against measuring a counter that wrapped away.
        if (m.counter) {
          expect(Math.abs(m.counter.top - m.bar.top), 'counter and bar are on different rows').toBeLessThanOrEqual(14);
          expect(m.bar.left - m.counter.right, 'counter overlaps the bar').toBeGreaterThanOrEqual(0);
        }
        if (m.control) {
          expect(m.control.left - m.bar.right, 'bar overlaps the page controls').toBeGreaterThanOrEqual(0);
        }

        expect(fillRatio(m), 'bar leaves too much of its row empty').toBeGreaterThanOrEqual(MIN_FILL);
      });

      test(`${nav}: dividers are symmetric and clear of the end beads`, async ({ page }) => {
        await page.goto(TUNE_URL);
        await seedDex(page);
        await gotoPage(page, nav);

        const m = await measureHeader(page);
        expect(m.dividers).toHaveLength(2);

        const [left, right] = m.dividers;
        const insetLeft = left.left - m.bar.left;
        const insetRight = m.bar.right - right.right;
        expect(Math.abs(insetLeft - insetRight), 'dividers are not symmetric about the bar').toBeLessThanOrEqual(1.5);

        expect(m.barVisual).not.toBeNull();
        expect(m.barVisual!.left - left.right, 'end bead overlaps the left divider').toBeGreaterThanOrEqual(0);
        expect(right.left - m.barVisual!.right, 'end bead overlaps the right divider').toBeGreaterThanOrEqual(0);
      });
    }

    test('bar width does not jump when returning to a page', async ({ page }) => {
      await page.goto(TUNE_URL);
      await seedDex(page);

      await gotoPage(page, 'builder');
      const first = (await measureHeader(page)).bar.width;

      await gotoPage(page, 'view');
      await gotoPage(page, 'analytics');
      await gotoPage(page, 'builder');
      const second = (await measureHeader(page)).bar.width;

      // Guards the "no re-animation on page switch" behaviour.
      expect(Math.abs(second - first), 'bar re-animated instead of holding its width').toBeLessThanOrEqual(0.5);
    });
  });
}
