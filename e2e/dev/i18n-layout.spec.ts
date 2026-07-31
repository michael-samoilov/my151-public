import { expect, test, type Page } from '@playwright/test';
import { NAV_PAGES, seedDex } from '../support/milestoneHeader';

/**
 * Layout verification against the pseudo-locales, run before any real
 * translation exists.
 *
 * `?lang=en-XA` accents every letter, pads the text ~40% (German's worst case)
 * and brackets it; `?lang=en-XC` swaps Latin for full-width CJK. Between them
 * they exercise the two ways translated text breaks a layout: it gets longer,
 * and its glyphs get wider and taller.
 *
 * Assertions here are structural rather than pixel snapshots — 9 locales x 4
 * pages x 3 viewports of baselines would churn on every unrelated CSS tweak and
 * teach everyone to re-bless them without looking.
 */

const PSEUDO = ['en-XA', 'en-XC'] as const;

async function open(page: Page, lang: string, nav: (typeof NAV_PAGES)[number]) {
  await page.goto(`/?tune&lang=${lang}`);
  await seedDex(page);
  await page.locator(`[data-nav="${nav}"]`).click();
  await page.waitForTimeout(300);
}

test.describe('pseudo-locale layout', () => {
  test('en-XA actually reaches the DOM', async ({ page }) => {
    // If this fails, every other assertion in this file is vacuous.
    await page.goto('/?tune&lang=en-XA');
    const build = page.locator('[data-nav="builder"] span').first();
    await expect(build).toHaveText(/^\[/);
    await expect(build).not.toHaveText('Build');
  });

  test('the picker is not offered a pseudo-locale', async ({ page }) => {
    // They are a development tool; a real user seeing "[Ɓúíłđ···]" would just
    // think the app is broken.
    await page.goto('/?tune');
    await expect(page.locator('[data-nav="builder"] span').first()).toHaveText('Build');
  });

  for (const lang of PSEUDO) {
    for (const nav of NAV_PAGES) {
      test(`${lang} · ${nav}: the page does not scroll sideways`, async ({ page }) => {
        await open(page, lang, nav);
        const overflow = await page.evaluate(() => {
          const el = document.scrollingElement ?? document.documentElement;
          return el.scrollWidth - el.clientWidth;
        });
        expect(overflow, 'expanded text pushed the page wider than the viewport').toBeLessThanOrEqual(1);
      });

      test(`${lang} · ${nav}: no translated label is clipped`, async ({ page }) => {
        await open(page, lang, nav);
        // en-XA brackets every string, so a visible "[" with no "]" means the
        // tail was cut off rather than merely being wide.
        const clipped = await page.evaluate(() => {
          const bad: string[] = [];
          for (const el of Array.from(document.querySelectorAll('span, div, button, p, h1, h2, h3'))) {
            if (el.children.length > 0) continue;
            const text = (el.textContent ?? '').trim();
            if (!text.startsWith('[')) continue;
            const r = el.getBoundingClientRect();
            // Skip anything with no meaningful box. Zero is the obvious case;
            // 1px is the `sr-only` pattern, which hides text from sight by
            // clipping it to a single pixel on purpose. Asking whether that
            // text overflows is asking the wrong question — it is *all*
            // overflow, by design, and it is never read with the eyes. The
            // header's SEO tagline is one, and it turned this check red the
            // moment it was routed through the catalog and picked up brackets.
            if (r.width <= 1 || r.height <= 1) continue;
            if (el.scrollWidth > el.clientWidth + 1) bad.push(text.slice(0, 40));
          }
          return bad;
        });
        expect(clipped, 'these labels overflow their box').toEqual([]);
      });
    }
  }
});
