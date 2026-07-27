import { expect, test } from '@playwright/test';
import { NAV_PAGES, seedDex } from '../support/milestoneHeader';

/**
 * Finds strings that were never routed through `t()`.
 *
 * Under `?lang=en-XA` every catalog message renders accented and bracketed, so
 * any visible text still in plain ASCII letters is, by construction, a literal
 * that extraction missed. No parsing, no heuristics about which files hold copy
 * — the running app tells you directly.
 *
 * The allowlist is for text that is legitimately not a message: Pokémon names
 * (they come from the dataset and get their own localisation in a later phase),
 * the wordmark, and pure numerals.
 */

/**
 * Substrings whose presence makes a node's text expected, not a finding.
 * Everything structural is exempted in the DOM instead, via
 * `data-i18n-exempt`, so the reason lives next to the markup.
 */
const ALLOWED = [
  'my151', // wordmark — a brand asset, not copy
  '.app',
  // Copyright notice: proper nouns and a legal formula, kept verbatim in every
  // locale. The disclaimer beneath it IS translated (footer.disclaimer).
  'Nintendo / Game Freak / Creatures',
];

/** Text that is only digits, punctuation or symbols isn't copy. */
const HAS_LETTERS = /[A-Za-z]{3,}/;

test.describe('extraction coverage', () => {
  for (const nav of NAV_PAGES) {
    test(`${nav}: no visible text bypasses the catalog`, async ({ page }) => {
      await page.goto('/?tune&lang=en-XA');
      await seedDex(page);
      await page.locator(`[data-nav="${nav}"]`).click();
      await page.waitForTimeout(500);

      const found = await page.evaluate(() => {
        const out: { text: string; where: string }[] = [];
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          // Leaf text only, so a container isn't reported for its children.
          if (el.children.length > 0) continue;
          // Text that legitimately bypasses the catalog says so in the markup:
          //   pokemon-name — dataset values, localised in the name-catalog phase
          //   dev-tools    — the ?tune panel, never shown to a user
          if (el.closest('[data-i18n-exempt]')) continue;
          const text = (el.textContent ?? '').trim();
          if (!text) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          out.push({ text, where: el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0] });
        }
        return out;
      });

      const unextracted = found.filter(
        (n) =>
          HAS_LETTERS.test(n.text) &&
          // Accented output always carries the brackets the pseudo-locale adds.
          !n.text.includes('[') &&
          !ALLOWED.some((a) => n.text.includes(a)),
      );

      // Pokémon names are dataset values, localised in a later phase; they are
      // reported separately rather than silently ignored, so the count can't
      // quietly grow.
      const report = unextracted.map((n) => `${n.text.slice(0, 60)}  <${n.where}>`);
      expect(report, `strings not routed through t() on the ${nav} page`).toEqual([]);
    });
  }
});
