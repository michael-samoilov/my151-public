import { expect, test } from '@playwright/test';

/**
 * While a bottom sheet is open, a gesture the sheet cannot consume must not
 * scroll the page behind it. The guard that enforces this asks whether any
 * ancestor between the touch and the sheet can scroll — and it has to ask
 * about the axis the finger is actually moving in.
 *
 * Asking only about the vertical axis froze the filter chip rows: they scroll
 * on X and have nothing to scroll on Y, so the guard read them as dead area
 * and swallowed every sideways swipe.
 */

test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

/** Dispatches a drag on the first element matching `role` and reports whether
 *  the page prevented it. Synthetic events keep this deterministic — headless
 *  gesture synthesis does not reliably drive native scrolling. */
async function drag(
  page: import('@playwright/test').Page,
  role: 'chips' | 'list' | 'backdrop',
  dx: number,
  dy: number,
) {
  return page.evaluate(
    ({ role, dx, dy }) => {
      const pick = (test: (el: HTMLElement) => boolean) => {
        let found: HTMLElement | null = null;
        document.querySelectorAll('div').forEach((el) => {
          if (!found && test(el as HTMLElement)) found = el as HTMLElement;
        });
        return found;
      };
      const target =
        role === 'chips'
          ? pick((el) => {
              const cs = getComputedStyle(el);
              return (
                (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
                el.scrollWidth > el.clientWidth + 2
              );
            })
          : role === 'list'
            ? pick((el) => {
                const cs = getComputedStyle(el);
                return (
                  (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
                  el.scrollHeight > el.clientHeight + 2
                );
              })
            : (document.querySelector('[data-overlay="true"]') as HTMLElement | null);
      if (!target) return 'missing';

      const touch = (type: string, x: number, y: number) => {
        const t = new Touch({ identifier: 1, target, clientX: x, clientY: y });
        return new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [t],
          targetTouches: [],
          changedTouches: [t],
          bubbles: true,
          cancelable: true,
        });
      };
      target.dispatchEvent(touch('touchstart', 300, 400));
      const move = touch('touchmove', 300 + dx, 400 + dy);
      target.dispatchEvent(move);
      target.dispatchEvent(touch('touchend', 300 + dx, 400 + dy));
      return move.defaultPrevented ? 'blocked' : 'allowed';
    },
    { role, dx, dy },
  );
}

test.describe('bottom sheet scroll guard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator('[data-add-slot]').first().click();
    await expect(page.locator('[data-overlay="true"]').first()).toBeVisible();
  });

  test('the filter chips can be swiped sideways', async ({ page }) => {
    expect(await drag(page, 'chips', -90, 3)).toBe('allowed');
  });

  test('the tile gallery still scrolls', async ({ page }) => {
    expect(await drag(page, 'list', 3, -90)).toBe('allowed');
  });

  test('a gesture with nothing to scroll never reaches the page behind', async ({ page }) => {
    // Dragging the chip row vertically, and the backdrop in any direction,
    // has no taker inside the sheet — both must stay swallowed.
    expect(await drag(page, 'chips', 3, -90)).toBe('blocked');
    expect(await drag(page, 'backdrop', 3, -90)).toBe('blocked');
  });
});
