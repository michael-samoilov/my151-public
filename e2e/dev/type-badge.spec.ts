import { expect, test } from '@playwright/test';

/**
 * The type badge draws its own text now, so it can break in ways a shipped
 * image never could: the word overflowing its pill, or sitting at a different
 * height in one language than another.
 *
 * Nine languages x eighteen types is 162 combinations, so they are measured
 * rather than eyeballed. The browser's type filter renders all eighteen at
 * once, which makes it the natural place to do it — and means this measures the
 * real component in a real page, not a test harness's copy of it.
 *
 * The words themselves are not negotiable. They are dumped from Scarlet and
 * Violet's own `typename` table (`docs/i18n/sources/scarlet-violet-typenames.json`,
 * asserted by `npm run i18n:verify`), so the badge has to fit whatever the game
 * says — including Italian `Coleottero`, a third wider than the space the
 * English-tuned geometry reserves. That is what `src/lib/typeBadgeFit.ts` exists
 * to solve, and this is what proves it solved it.
 *
 * Everything below is asserted for all nine languages. An earlier version of
 * this spec asserted only English and printed the rest as annotations, because
 * the rest genuinely did not fit; leaving that in place now would mean the
 * fitting work had no test.
 *
 * The numbers are written out as literals rather than imported from
 * `typeBadgeGeometry.ts`. A spec that recomputes its expectations from the
 * module under test passes by construction.
 */

const LOCALES = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'fr', 'de', 'es', 'it'] as const;

/** The badge's own coordinate height. */
const TYPE_BADGE_H = 40;
/** The target ink band: 24 units tall, centred 1 unit below the pill's middle. */
const CAP_HEIGHT = 24;
const INK_CENTER = 21;
/**
 * The space the word may occupy. The symbol's box ends at 45 and the pill's
 * inset is 15, and the word is centre-anchored at 113 — so it may run 65 units
 * left before touching the symbol and 72 right before the edge.
 */
const TEXT_WIDTH = 130;

interface Measurement {
  label: string;
  /** Painted width as a fraction of the reserved box. >1 overflows the pill. */
  fill: number;
  /** Vertical centre of the painted glyphs, in the badge's own 0-40 units. */
  inkCenter: number;
  /** Painted height of the glyphs, same units. */
  inkHeight: number;
  /** Rendered pill height in CSS pixels. */
  height: number;
}

// Desktop, where the type filter is an inline panel rather than a second sheet
// stacked on the browser's own.
test.use({ viewport: { width: 1280, height: 900 } });

async function measure(page: import('@playwright/test').Page, locale: string): Promise<Measurement[]> {
  await page.goto(`/pokedex-builder?lang=${locale}`);
  // By attribute: both buttons' accessible names are in the page's language.
  await page.locator('[data-add-slot]').first().click();
  await page.locator('[data-filter-chip="type"]').first().click();
  const grid = page.locator('[data-testid="type-filter"]');
  await expect(grid.locator('svg[role="img"]')).toHaveCount(18);

  // The badge measures itself against the resolved font and throws those
  // measurements away once the webfont lands. Reading before that settles would
  // catch a frame sized for a fallback face.
  await page.evaluate(() => document.fonts.ready);

  return grid.evaluate((root) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    return Array.from(root.querySelectorAll('svg[role="img"]')).map((svg) => {
      const text = svg.querySelector('text') as SVGTextElement;
      const label = text.textContent ?? '';

      // Read what was actually rendered rather than recomputing it: the font
      // size and baseline are chosen per string, and the condense lives on the
      // parent <g>'s transform. Taking all three off the DOM is what makes this
      // a measurement of the component rather than a restatement of it.
      const style = getComputedStyle(text);
      const fontSize = parseFloat(text.getAttribute('font-size') ?? style.fontSize);
      const baseline = parseFloat(text.getAttribute('y') ?? '0');
      const scaleX = (svg.querySelector('g') as SVGGElement).transform.baseVal.consolidate()?.matrix.a ?? 1;

      // Canvas `actualBoundingBox*` are true ink extents for these exact
      // characters in the same font the SVG resolved — the only way to see the
      // Latin-vs-CJK offset this badge is designed to remove. `getBBox` would
      // give the layout box, which is the font's ascent and descent and so says
      // nothing about where the glyphs actually sit.
      ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
      const m = ctx.measureText(label);

      return {
        label,
        fill: (m.width * scaleX) / 130,
        inkCenter: baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2,
        inkHeight: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
        height: svg.getBoundingClientRect().height,
      };
    });
  });
}

test.describe('type badge', () => {
  for (const locale of LOCALES) {
    test(`${locale}: every official type name fits its badge`, async ({ page }) => {
      const rows = await measure(page, locale);

      // A missing catalog entry would render a blank pill, which reads as
      // deliberate rather than broken.
      expect(rows.filter((r) => !r.label.trim())).toEqual([]);

      // No word may be wider than the space reserved for it.
      //
      // 1.002 is deliberately tight. It was 1.01, which was too loose to be
      // worth having: Italian `COLEOTTERO` came out at 1.005 on one machine and
      // 1.01 on CI, because the badge was predicting its width after a font-size
      // change rather than measuring it, and how far that prediction misses
      // depends on the platform's rasterizer. The badge now re-measures and
      // clamps, so every word that needs fitting lands on 1.00000 exactly on
      // whatever engine is running, and the only slack still needed is float
      // rounding through the SVG transform matrix.
      const overflowing = rows
        .filter((r) => r.fill > 1.002)
        .map((r) => `${r.label} ${(r.fill * 100).toFixed(1)}%`);
      expect(overflowing, 'these words are wider than the pill reserves').toEqual([]);

      // Height comes from the viewBox, so differing heights would mean some
      // badge's content had escaped and stretched its box.
      const heights = new Set(rows.map((r) => Math.round(r.height)));
      expect([...heights], 'pills rendered at different heights').toHaveLength(1);

      // The painted glyphs must sit on the pill's optical centre — which the
      // art puts a whole unit below the pill's geometric centre, a deliberate
      // offset that only shows up in a measurement.
      //
      // This is the assertion the badge's SVG-instead-of-flexbox design exists
      // to satisfy, and the one that used to be English-only: a flex box centres
      // the *line box*, whose height is the font's ascent and descent, and Latin
      // and CJK fonts disagree about those by ~20%, so one rule lands the two
      // scripts at visibly different heights.
      //
      // Averaged across the eighteen names, because a single word's ink centre
      // legitimately moves with its letters and typography centres on the band,
      // not on each word's own extents. A systematic per-script offset — the
      // thing that put Japanese three units low — is what this catches.
      const mean = rows.reduce((a, r) => a + r.inkCenter, 0) / rows.length;
      expect(
        Math.abs(mean - INK_CENTER),
        `${locale} paints its words at ${mean.toFixed(2)}; the art paints them at ${INK_CENTER}`,
      ).toBeLessThan(1.5);

      // Each script must paint a consistent band — that is what makes a
      // Japanese badge and an Italian one read as one design rather than two.
      //
      // The two targets differ on purpose, and matching them is what looked
      // wrong. A Han character packs up to a dozen strokes into a square where
      // a Latin capital has two or three, so at equal measured height the Han
      // reads visibly smaller; ten of the eighteen Chinese type names are a
      // single character, with nothing else on the badge to help. CJK is
      // therefore set 1.28x the Latin cap height, which is where the two match
      // optically. Written out rather than imported, like every other number
      // here.
      const CJK_LOCALES = ['ja', 'ko', 'zh-Hans', 'zh-Hant'];
      const targetBand = CJK_LOCALES.includes(locale) ? CAP_HEIGHT * 1.28 : CAP_HEIGHT;
      const meanInk = rows.reduce((a, r) => a + r.inkHeight, 0) / rows.length;
      expect(
        Math.abs(meanInk - targetBand),
        `${locale} paints a ${meanInk.toFixed(1)}-unit band; the target is ${targetBand.toFixed(1)}`,
      ).toBeLessThan(4);

      // No word may be painted outside the pill it sits in.
      const clipped = rows.filter(
        (r) => r.inkCenter - r.inkHeight / 2 < 0 || r.inkCenter + r.inkHeight / 2 > TYPE_BADGE_H,
      );
      expect(clipped.map((r) => r.label), 'these words overflow the pill vertically').toEqual([]);

      // Recorded so a regression report carries the actual number, and so the
      // widest name in each language stays visible in the run log.
      const worst = rows.reduce((a, b) => (a.fill > b.fill ? a : b));
      test.info().annotations.push({
        type: 'widest',
        description:
          `${worst.label} fills ${(worst.fill * 100).toFixed(0)}% of ${TEXT_WIDTH} · ` +
          `ink centre ${mean.toFixed(2)} · band ${meanInk.toFixed(1)}`,
      });
    });
  }
});
