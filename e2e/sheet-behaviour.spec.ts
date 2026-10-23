import { expect, test } from '@playwright/test';

/**
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

  const appScrollTop = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-build-scroll]');
      return el ? el.scrollTop : -1;
    });

  test('the app does not scroll behind an open sheet', async ({ page }) => {
    await page.goto('/pokedex-builder?demo');
    await expect.poll(() => appScrollTop(page)).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-build-scroll]');
      if (el) el.scrollTop = 400;
    });
    const before = await appScrollTop(page);
    expect(before).toBe(400);

    await page.getByRole('button', { name: /report|feedback|problem/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

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
    await page.goto('/pokedex-builder?demo');
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
    await page.goto('/pokedex-builder?demo');
    await page.getByRole('button', { name: /report|feedback|problem/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const KEYBOARD_LEAVES = 338;
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
    expect(box.sheetTop, 'the sheet holds space empty above itself').toBeLessThanOrEqual(
      KEYBOARD_TOP_GAP + 1,
    );
    for (const part of ['textarea', 'disclosure', 'submit'] as const) {
      expect(box[part]!, `the ${part} is below the fold of the sheet`).toBeLessThanOrEqual(
        box.sheetBottom + 1,
      );
    }
  });

  test('the focused field is at least 16px, so iOS does not zoom', async ({ page }) => {
    await page.goto('/pokedex-builder?demo');
    await page.getByRole('button', { name: /report|feedback|problem/i }).first().click();

    const field = page.getByRole('dialog').locator('textarea').first();
    await expect(field).toBeVisible();

    const px = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px, `the textarea renders at ${px}px; iOS zooms anything under 16`).toBeGreaterThanOrEqual(16);
  });
});
