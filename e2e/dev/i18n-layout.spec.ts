import { expect, test, type Page } from '@playwright/test';
import { NAV_PAGES, seedDex } from '../support/dexSeed';
import { LOCALES } from '../../src/i18n/config';

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
  await page.goto(`/pokedex-builder?tune&lang=${lang}`);
  await seedDex(page);
  await page.locator(`[data-nav="${nav}"]`).click();
  await page.waitForTimeout(300);
}

test.describe('pseudo-locale layout', () => {
  test('en-XA actually reaches the DOM', async ({ page }) => {
    // If this fails, every other assertion in this file is vacuous.
    await page.goto('/pokedex-builder?tune&lang=en-XA');
    const build = page.locator('[data-nav="builder"] span').first();
    await expect(build).toHaveText(/^\[/);
    await expect(build).not.toHaveText('Build');
  });

  test('the picker is not offered a pseudo-locale', async ({ page }) => {
    // They are a development tool; a real user seeing "[Ɓúíłđ···]" would just
    // think the app is broken.
    await page.goto('/pokedex-builder?tune');
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
            // Text nobody can see cannot be clipped: the FAQ under the footer
            // sits in a closed <details>, whose content keeps a box but is not
            // rendered (content-visibility), so its paragraphs report a
            // zero client width against a real scroll width.
            if (!(el as HTMLElement).checkVisibility()) continue;
            // An ellipsis is a decision, not an accident. The tool bar's h1
            // eyebrow keeps its full text in the DOM for crawlers and truncates
            // by CSS where the bar is too narrow (docs/seo/HANDOFF.md, the
            // gym leader agent's item 3); that is the one string allowed to.
            if (getComputedStyle(el).textOverflow === 'ellipsis') continue;
            if (el.scrollWidth > el.clientWidth + 1) bad.push(text.slice(0, 40));
          }
          return bad;
        });
        expect(clipped, 'these labels overflow their box').toEqual([]);
      });
    }
  }
});

/**
 * Section outline labels on the View page, in every real language.
 *
 * An outline label falls back through the section name, its short form and its
 * tiny form until one fits (`fitLabel` in src/lib/sectionOutlines.ts), and the
 * tiny form is what an outline one cell wide shows. A translation that is too
 * long never overflows: the label is squashed to fit. So the defect a long
 * translation causes is a label squashed too thin to read, and the check is on
 * the squash itself.
 *
 * English sets the bar. Its own one-cell labels stay as they are, and several
 * of them sit below the 0.72 squash floor, so a translation passes when it is
 * at the floor or at least as wide as the English label for the same section.
 * The width check catches the other failure: the label is measured on a canvas
 * in Inter, and a script that renders in another font could come out wider on
 * the page than the measurement allowed for.
 */
test.describe('section outline labels in every language', () => {
  // One Pokémon in every build section, so every outline is one cell wide. The
  // ids sit in different evolution lines, so the View page keeps them apart.
  const ONE_EACH: Record<string, number[]> = {
    starter: [1], 'early-bug': [10], 'early-bird': [16], 'early-rodent': [19], 'pikachu-clone': [25],
    'early-normal': [52], forest: [43], meadow: [35], 'cave-pokemon': [41], swamp: [88], dojo: [56],
    haunted: [92], ruins: [63], beach: [90], 'fishing-pokemon': [129], ocean: [72], desert: [27],
    volcanic: [58], tundra: [124], industrial: [81], mimic: [132], 'rivalry-pair': [115], 'evil-team': [109],
    other: [200], fossil: [138], 'pseudo-legendary': [147], legendary: [144], mythical: [151],
  };
  const FLOOR = 0.72;
  // A cell gives a label 0.86 of a tile to fill, at a font 0.26 of a tile.
  const CELL_EM = 0.86 / 0.26;

  async function labels(page: Page, lang: string) {
    await page.goto(`/pokedex-builder?tune&lang=${lang}`);
    await page.waitForFunction(() => '__pokedexStore' in window);
    await page.evaluate((sections) => {
      const store = (window as unknown as { __pokedexStore: { setState: (p: Record<string, unknown>) => void } }).__pokedexStore;
      store.setState({
        sections, milestoneMax: 100, milestoneCelebrated: [25, 100], milestoneCelebration: null,
        viewShowSections: true, viewSortOption: 'build-order',
      });
    }, ONE_EACH);
    await page.locator('[data-nav="view"]').click();
    await page.evaluate(() => document.fonts.ready);
    const label = page.locator('div.font-black.uppercase.whitespace-nowrap');
    await expect(label).toHaveCount(Object.keys(ONE_EACH).length);
    await page.waitForTimeout(300);
    return label.evaluateAll((els) =>
      els.map((el) => {
        const style = (el as HTMLElement).style;
        const fontPx = parseFloat(style.fontSize);
        return {
          text: el.textContent ?? '',
          scale: Number(/scaleX\(([\d.]+)\)/.exec(style.transform)?.[1] ?? 1),
          widthEm: el.getBoundingClientRect().width / fontPx,
        };
      }),
    );
  }

  test('the shortest label fits a one-cell outline', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const english = await labels(page, 'en');
    const results: Record<string, { text: string; scale: number; widthEm: number }[]> = { en: english };
    const bad: string[] = [];
    for (const lang of LOCALES.filter((l) => l !== 'en')) {
      const found = await labels(page, lang);
      results[lang] = found;
      found.forEach((l, i) => {
        const bar = Math.min(FLOOR, english[i].scale) * 0.97;
        if (l.scale < bar) bad.push(`${lang} "${l.text}" squashed to ${l.scale.toFixed(2)}, English to ${english[i].scale.toFixed(2)}`);
        if (l.widthEm > CELL_EM + 0.05) bad.push(`${lang} "${l.text}" is ${l.widthEm.toFixed(2)}em wide in a ${CELL_EM.toFixed(2)}em cell`);
      });
    }
    await testInfo.attach('outline-labels', { body: JSON.stringify(results, null, 1), contentType: 'application/json' });
    expect(bad, 'outline labels that do not fit one cell').toEqual([]);
  });
});
