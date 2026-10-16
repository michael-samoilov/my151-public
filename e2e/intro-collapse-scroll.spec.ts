import { expect, test, type Page } from '@playwright/test';

/**
 * The first-visit intro card sits at the top of the build scroller. Placing the
 * first Pokémon folds it away — and when that placement targets a section
 * below the fold, the fold happens *above* the viewport. Chrome and Firefox
 * absorb that with CSS scroll anchoring; Safari has never implemented it, so on
 * iOS the whole page used to jump up by the card's height and the section the
 * user had just filled left the screen.
 *
 * Playwright drives Chromium, which anchors. To exercise the Safari path the
 * spec stands in for Safari on both counts the app can observe: the anchoring
 * behaviour is switched off, and `CSS.supports('overflow-anchor')` reports
 * false, which is how `IntroCard` decides to make the correction itself.
 *
 * Mobile only: at md and up the browser is a side panel and adds instantly, a
 * different flow. Keyed on width, matching bottom-sheet.spec.ts.
 */
test.describe('intro card collapse keeps the page still', { tag: '@viewport' }, () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'mobile sheet flow only');

  const SECTION = 'forest';

  async function emulateSafariScrolling(page: Page) {
    await page.addInitScript(() => {
      const real = CSS.supports.bind(CSS) as (...args: string[]) => boolean;
      Reflect.set(CSS, 'supports', (...args: string[]) =>
        String(args[0]).includes('overflow-anchor') ? false : real(...args));
      const apply = () => {
        const style = document.createElement('style');
        style.textContent = '* { overflow-anchor: none !important }';
        document.head.appendChild(style);
      };
      if (document.head) apply();
      else document.addEventListener('DOMContentLoaded', apply);
    });
  }

  function sectionOffset(page: Page) {
    return page.evaluate((id) => {
      const scroller = document.querySelector('[data-build-scroll]');
      const section = document.querySelector(`[data-section-id="${id}"]`);
      if (!scroller || !section) return null;
      return Math.round(section.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
    }, SECTION);
  }

  async function placeFirstPokemonBelowTheFold(page: Page) {
    await page.goto('/pokedex-builder');
    await expect(page.getByRole('button', { name: 'Dismiss intro' })).toBeVisible();

    await page.getByRole('button', { name: 'Add a Pokémon to Forest' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByText('Paras', { exact: true }).first().click();

    const addButton = page.getByRole('button', { name: /^Add \d/ });
    await expect(addButton).toBeVisible();
    const before = await sectionOffset(page);

    await addButton.click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.locator('[data-section-id]').first().isVisible(), { timeout: 5_000 }).toBe(true);
    await page.waitForTimeout(1_500);
    const after = await sectionOffset(page);

    return { before, after };
  }

  test('on Safari (no scroll anchoring) the filled section stays where it was', async ({ page }) => {
    await emulateSafariScrolling(page);
    const { before, after } = await placeFirstPokemonBelowTheFold(page);

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs(after! - before!)).toBeLessThanOrEqual(2);
    expect(after!).toBeGreaterThan(0);
  });

  test('on anchoring browsers the app does not correct a second time', async ({ page }) => {
    const { before, after } = await placeFirstPokemonBelowTheFold(page);

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    // Chromium anchors on its own. If IntroCard also compensated, the section
    // would land ~374px *lower* than it started.
    expect(Math.abs(after! - before!)).toBeLessThanOrEqual(2);
  });

  const CARD_SLICE_ON_SCREEN = 170;

  async function fillStartersWithCardStraddlingTheTop(page: Page) {
    await page.goto('/pokedex-builder');
    await expect(page.getByRole('button', { name: 'Dismiss intro' })).toBeVisible();

    await page.evaluate((keep) => {
      const scroller = document.querySelector('[data-build-scroll]') as HTMLElement;
      const card = document.querySelector('.intro-float-a')!.closest('.grid') as HTMLElement;
      const target = card.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top - keep;
      scroller.scrollTop = Math.max(0, Math.round(target));
    }, CARD_SLICE_ON_SCREEN);

    await page.locator('[data-section-id="starter"] button.border-dashed').nth(6).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByText('Squirtle', { exact: true }).first().click();

    const addButton = page.getByRole('button', { name: /^Add 3/ });
    await expect(addButton).toBeVisible();
    const before = await startersOffset(page);

    await addButton.click();
    await expect(sheet).toBeHidden();
    await page.waitForTimeout(1_500);

    return { before, ...(await restingState(page)) };
  }

  function startersOffset(page: Page) {
    return page.evaluate(() => {
      const scroller = document.querySelector('[data-build-scroll]');
      const section = document.querySelector('[data-section-id="starter"]');
      if (!scroller || !section) return null;
      return Math.round(section.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
    });
  }

  function restingState(page: Page) {
    return page.evaluate(() => {
      const scroller = document.querySelector('[data-build-scroll]') as HTMLElement | null;
      const section = document.querySelector('[data-section-id="starter"]');
      if (!scroller || !section) return { after: null, scrollTop: null, listPadding: null };
      const list = section.parentElement?.parentElement as HTMLElement | null;
      return {
        after: Math.round(section.getBoundingClientRect().top - scroller.getBoundingClientRect().top),
        scrollTop: Math.round(scroller.scrollTop),
        listPadding: list ? Math.round(parseFloat(getComputedStyle(list).paddingTop)) : null,
      };
    });
  }

  test('on Safari, filling Starters under a half-scrolled card keeps Starters on screen', async ({ page }) => {
    await emulateSafariScrolling(page);
    const { before, after, scrollTop, listPadding } = await fillStartersWithCardStraddlingTheTop(page);

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(listPadding).toBeGreaterThan(0);
    expect(after!).toBeGreaterThan(0);
    expect(scrollTop).toBe(0);
    expect(Math.abs(after! - listPadding!)).toBeLessThanOrEqual(2);
  });

  test('on anchoring browsers the straddling case is corrected too', async ({ page }) => {
    const { before, after, scrollTop, listPadding } = await fillStartersWithCardStraddlingTheTop(page);

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    // Chromium's own anchor lands inside the shrinking card here and scrolls
    // the wrong way (measured 394px). IntroCard has to take over.
    expect(after!).toBeGreaterThan(0);
    expect(scrollTop).toBe(0);
    expect(Math.abs(after! - listPadding!)).toBeLessThanOrEqual(2);
  });

  test('dismissing the card while it is on screen never touches scrollTop', async ({ page }) => {
    await emulateSafariScrolling(page);
    await page.goto('/pokedex-builder');
    const dismiss = page.getByRole('button', { name: 'Dismiss intro' });
    await expect(dismiss).toBeVisible();

    await dismiss.click();
    await expect(dismiss).toBeHidden({ timeout: 5_000 });

    const scrollTop = await page.evaluate(
      () => document.querySelector('[data-build-scroll]')?.scrollTop ?? null,
    );
    expect(scrollTop).toBe(0);
  });
});
