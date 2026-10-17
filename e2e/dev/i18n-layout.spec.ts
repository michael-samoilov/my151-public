import { expect, test, type Page } from '@playwright/test';
import { NAV_PAGES, seedDex } from '../support/dexSeed';
import { LOCALES } from '../../src/i18n/config';

const PSEUDO = ['en-XA', 'en-XC'] as const;

async function open(page: Page, lang: string, nav: (typeof NAV_PAGES)[number]) {
  await page.goto(`/pokedex-builder?tune&lang=${lang}`);
  await seedDex(page);
  await page.locator(`[data-nav="${nav}"]`).click();
  await page.waitForTimeout(300);
}

test.describe('pseudo-locale layout', () => {
  test('en-XA actually reaches the DOM', async ({ page }) => {
    await page.goto('/pokedex-builder?tune&lang=en-XA');
    const build = page.locator('[data-nav="builder"] span').first();
    await expect(build).toHaveText(/^\[/);
    await expect(build).not.toHaveText('Build');
  });

  test('the picker is not offered a pseudo-locale', async ({ page }) => {
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
        const clipped = await page.evaluate(() => {
          const bad: string[] = [];
          for (const el of Array.from(document.querySelectorAll('span, div, button, p, h1, h2, h3'))) {
            if (el.children.length > 0) continue;
            const text = (el.textContent ?? '').trim();
            if (!text.startsWith('[')) continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1) continue;
            // Text nobody can see cannot be clipped: the FAQ under the footer
            // sits in a closed <details>, whose content keeps a box but is not
            // rendered (content-visibility), so its paragraphs report a
            // zero client width against a real scroll width.
            if (!(el as HTMLElement).checkVisibility()) continue;
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

test.describe('section outline labels in every language', () => {
  const ONE_EACH: Record<string, number[]> = {
    starter: [1], 'early-bug': [10], 'early-bird': [16], 'early-rodent': [19], 'pikachu-clone': [25],
    'early-normal': [52], forest: [43], meadow: [35], 'cave-pokemon': [41], swamp: [88], dojo: [56],
    haunted: [92], ruins: [63], beach: [90], 'fishing-pokemon': [129], ocean: [72], desert: [27],
    volcanic: [58], tundra: [124], industrial: [81], mimic: [132], 'rivalry-pair': [115], 'evil-team': [109],
    other: [200], fossil: [138], 'pseudo-legendary': [147], legendary: [144], mythical: [151],
  };
  const FLOOR = 0.72;
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
    await page.addInitScript(() => localStorage.setItem('p151-league-promo-seen', '1'));
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
