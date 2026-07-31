import { expect, test } from '@playwright/test';

/**
 * Two things a mobile sheet has to get right, both of which it got wrong.
 *
 * **The page must not scroll behind it.** Without a scroll lock the app moves
 * *through* the sheet: a drag starting on the backdrop scrolls the page beneath,
 * and a scroll inside the sheet keeps going into the page once the sheet's own
 * content runs out. The sheet stops reading as a layer above the app and starts
 * reading as a sticker on a moving one.
 *
 * **Focusing a field must not zoom the page.** iOS Safari zooms the whole
 * viewport when a field with a font smaller than 16px takes focus. The app's
 * root font size floors at 16px, so `text-sm` lands at 14 — and the feedback
 * textarea is autofocused, so the zoom fired on open rather than on tap. The
 * shared `Input` component already carried `text-base md:text-sm` for exactly
 * this reason; the raw `<textarea>` had not followed it.
 *
 * The zoom itself is a WebKit behaviour that Chromium does not reproduce, so
 * asserting on a zoom level here would prove nothing. The *cause* is testable
 * and deterministic: the computed font size of the focused field. That is what
 * this checks, on the real element, at a mobile width.
 */

test.describe('mobile sheet', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** The app's scroll pane — an inner `overflow-y-auto`, not the document. */
  const appScrollTop = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-build-scroll]');
      return el ? el.scrollTop : -1;
    });

  test('the app does not scroll behind an open sheet', async ({ page }) => {
    await page.goto('/?demo');
    await expect.poll(() => appScrollTop(page)).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-build-scroll]');
      if (el) el.scrollTop = 400;
    });
    const before = await appScrollTop(page);
    expect(before).toBe(400);

    await page.getByRole('button', { name: /report|feedback|problem/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Over the sheet, then over the backdrop above it. Before the fix each of
    // these moved the app by the full wheel delta — not through scroll
    // chaining, but because App.tsx forwards wheel events from beside the build
    // page straight into its scroller, and the sheet is a DOM descendant of
    // that area. A handler that assigns `scrollTop` by hand cannot be stopped
    // with `preventDefault`, which is why it has to opt out by target instead.
    await page.mouse.move(195, 700);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(250);
    expect(await appScrollTop(page), 'wheeling over the sheet scrolled the app').toBe(before);

    await page.mouse.move(195, 100);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(250);
    expect(await appScrollTop(page), 'wheeling over the backdrop scrolled the app').toBe(before);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await appScrollTop(page)).toBe(before);
  });

  test('closing the sheet gives scrolling back', async ({ page }) => {
    // The mirror: the opt-out must not outlive the sheet, or the whitespace
    // beside the build page stops forwarding scroll at all.
    await page.goto('/?demo');
    await page.getByRole('button', { name: /report|feedback|problem/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    const before = await appScrollTop(page);
    await page.mouse.move(195, 300);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(250);
    expect(await appScrollTop(page), 'the app should scroll again once the sheet is gone').toBeGreaterThan(before);
  });

  test('the whole form stays above the on-screen keyboard', async ({ page }) => {
    // `position: fixed` anchors to the layout viewport, which does not shrink
    // when the keyboard opens — so a bottom-anchored sheet keeps its bottom
    // edge underneath it, hiding the tail of the textarea, the disclosure and
    // the submit button. On the one surface whose entire purpose is typing.
    //
    // Chromium has no keyboard to raise, so the keyboard is simulated the way
    // iOS reports one: the visual viewport gets shorter while the layout
    // viewport does not. That is exactly the signal the fix reads.
    await page.goto('/?demo');
    await page.getByRole('button', { name: /report|feedback|problem/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // What an iPhone 15 Pro actually leaves with the keyboard up: 852 CSS px of
    // screen, less the browser chrome, less a keyboard whose accessory bar
    // counts toward the inset. The first version of this test used 480, which
    // is roomy enough that the form fitted without trying — so it went green
    // while the real phone hid the disclosure and the button under the fold.
    const KEYBOARD_LEAVES = 338;
    // The gap the sheet holds above itself once a keyboard is open. Measured,
    // not chosen: the form compresses to 178px and no further, so at the
    // default 56 the whole thing stops fitting below a 234px viewport, and at 8
    // it survives to 186. The headroom is the lesser half of why it matters —
    // the same 48px is textarea at every keyboard height, not just the tight
    // ones.
    const KEYBOARD_TOP_GAP = 8;
    await page.evaluate((visible) => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, 'height', { value: visible, configurable: true });
      // Report a *fractional* scale, the way iOS Safari does. Chromium hands
      // back exactly 1, and the first version of this fix compared with
      // `!== 1` — so it worked in the test and did nothing on a real phone,
      // where the sheet stayed behind the keyboard. Simulating the tidy number
      // is simulating the engine that never had the bug.
      Object.defineProperty(vv, 'scale', { value: 0.9999999403953552, configurable: true });
      vv.dispatchEvent(new Event('resize'));
    }, KEYBOARD_LEAVES);
    await page.waitForTimeout(400);

    const box = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>('[role="dialog"]')!;
      const bottom = (sel: string) => {
        const el = d.querySelector<HTMLElement>(sel);
        return el ? el.getBoundingClientRect().bottom : null;
      };
      return {
        sheetTop: d.getBoundingClientRect().top,
        sheetBottom: d.getBoundingClientRect().bottom,
        textarea: bottom('textarea'),
        // The "what gets sent" disclosure, which is what the report was about:
        // being able to read the field *and* the thing under it.
        disclosure: bottom('details summary'),
        submit: bottom('button[type="submit"]'),
      };
    });

    for (const part of ['textarea', 'disclosure', 'submit'] as const) {
      expect(box[part], `no ${part} found`).not.toBeNull();
    }

    expect(box.sheetBottom, 'the sheet extends behind the keyboard').toBeLessThanOrEqual(
      KEYBOARD_LEAVES + 1,
    );
    // The gap above the sheet keeps the grab handle clear of the browser
    // chrome, which is worth 56px when there is a screen to spend it from and
    // nothing at all when a keyboard has taken two thirds of one. Holding it
    // open is what kept the form scrolling after the sheet itself had stopped
    // hiding behind the keyboard.
    expect(box.sheetTop, 'the sheet holds space empty above itself').toBeLessThanOrEqual(
      KEYBOARD_TOP_GAP + 1,
    );
    // Against the sheet's own bottom, not the keyboard's. Fitting the sheet
    // above the keyboard was the first half of this bug; the second half was
    // the form overflowing the sheet it now fits in, which a check against the
    // keyboard line cannot see — a scrolled-away element reports a bottom past
    // the sheet, and the fix is that it no longer has to scroll.
    for (const part of ['textarea', 'disclosure', 'submit'] as const) {
      expect(box[part]!, `the ${part} is below the fold of the sheet`).toBeLessThanOrEqual(
        box.sheetBottom + 1,
      );
    }
  });

  test('the focused field is at least 16px, so iOS does not zoom', async ({ page }) => {
    await page.goto('/?demo');
    await page.getByRole('button', { name: /report|feedback|problem/i }).first().click();

    const field = page.getByRole('dialog').locator('textarea').first();
    await expect(field).toBeVisible();

    const px = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px, `the textarea renders at ${px}px; iOS zooms anything under 16`).toBeGreaterThanOrEqual(16);
  });
});
