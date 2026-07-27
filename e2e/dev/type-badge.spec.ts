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
 * The two extremes to watch are Italian `Coleottero` (the longest Latin name)
 * and Japanese `フェアリー` — five full-width katakana, wider than any Latin
 * name despite half the characters.
 */

const LOCALES = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'fr', 'de', 'es', 'it'] as const;

/** The badge's own coordinate height, mirrored from typeBadgeGeometry.ts. */
const TYPE_BADGE_H = 40;

interface Measurement {
  label: string;
  /** Text width as a fraction of the reserved text box. >1 overflows the pill. */
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
  await page.goto(`/?lang=${locale}`);
  await page.getByRole('button', { name: /^Add a Pokémon to / }).first().click();
  await page.getByRole('button', { name: 'Type', exact: true }).first().click();
  const grid = page.locator('[data-testid="type-filter"]');
  await expect(grid.locator('svg[role="img"]')).toHaveCount(18);

  return grid.evaluate((root) => {
    // The reserved text box, in the badge's own 200x40 units. Written out
    // rather than imported from typeBadgeGeometry.ts: a spec that recomputed
    // its expectations from the module under test would pass by construction.
    const TEXT_LEFT = 11 + 28 + 5;
    const TEXT_WIDTH = 200 - 11 - TEXT_LEFT;
    const FONT_SIZE = 22;
    const BASELINE = 40 / 2 + FONT_SIZE * 0.364;

    const ctx = document.createElement('canvas').getContext('2d')!;
    return Array.from(root.querySelectorAll('svg[role="img"]')).map((svg) => {
      const text = svg.querySelector('text') as SVGTextElement;
      const label = text.textContent ?? '';
      const b = text.getBBox();

      // getBBox gives the *layout* box, which is the font's ascent and descent
      // and so says nothing about where the glyphs actually sit. Canvas's
      // actualBoundingBox* are true ink extents for these exact characters, in
      // the same font the SVG resolved — which is the only way to see the
      // Latin-vs-CJK offset this badge is designed to avoid.
      const style = getComputedStyle(text);
      ctx.font = `700 ${FONT_SIZE}px ${style.fontFamily}`;
      const m = ctx.measureText(label);
      const inkCenter = BASELINE - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;

      return {
        label,
        fill: b.width / TEXT_WIDTH,
        inkCenter,
        inkHeight: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
        height: svg.getBoundingClientRect().height,
      };
    });
  });
}

test.describe('type badge', () => {
  for (const locale of LOCALES) {
    test(`${locale}: every type name fits its badge`, async ({ page }) => {
      const rows = await measure(page, locale);

      // A missing catalog entry would render a blank pill, which reads as
      // deliberate rather than broken.
      expect(rows.filter((r) => !r.label.trim())).toEqual([]);

      const tight = rows
        .filter((r) => r.fill > 0.95)
        .map((r) => `${r.label} fills ${(r.fill * 100).toFixed(0)}%`);
      expect(tight, 'these names crowd the pill; the font size needs to come down').toEqual([]);

      // Height comes from the viewBox, so differing heights would mean some
      // badge's content had escaped and stretched its box.
      const heights = new Set(rows.map((r) => Math.round(r.height)));
      expect([...heights], 'pills rendered at different heights').toHaveLength(1);

      // The painted glyphs must sit on the pill's centre. This is the assertion
      // the badge's SVG-instead-of-flexbox design exists to satisfy: a flex box
      // centres the *line box*, whose height is the font's ascent and descent,
      // and Latin and CJK fonts disagree about those by ~20% — so one rule
      // lands the two scripts at visibly different heights. The badge puts its
      // baseline a fixed fraction of the font size below centre instead, which
      // reads no font metrics at all.
      //
      // Averaged across the eighteen names, because a single word's ink centre
      // legitimately moves with its letters: `Bug` has a descender and `Normal`
      // does not, and typography centres on the cap band, not on each word's
      // own extents. A systematic per-script offset is what this catches.
      const ys = rows.map((r) => r.inkCenter);
      const mean = ys.reduce((a, y) => a + y, 0) / ys.length;
      expect(
        Math.abs(mean - TYPE_BADGE_H / 2),
        `${locale} paints its words ${(mean - TYPE_BADGE_H / 2).toFixed(2)} of 40 badge ` +
          `units off centre: ${JSON.stringify(rows.map((r) => [r.label, +r.inkCenter.toFixed(2)]))}`,
      ).toBeLessThan(2);

      // And no word may be painted outside the pill it sits in.
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
          `${worst.label} fills ${(worst.fill * 100).toFixed(0)}% · ` +
          `ink centre ${mean.toFixed(2)} of ${TYPE_BADGE_H / 2}`,
      });
    });
  }
});
