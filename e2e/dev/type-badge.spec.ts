import { expect, test } from '../support/test';

const LOCALES = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'fr', 'de', 'es', 'it'] as const;

const TYPE_BADGE_H = 40;
const CAP_HEIGHT = 24;
const INK_CENTER = 21;
const TEXT_WIDTH = 130;

interface Measurement {
  label: string;
  fill: number;
  inkCenter: number;
  inkHeight: number;
  height: number;
}

test.use({ viewport: { width: 1280, height: 900 } });

async function measure(page: import('@playwright/test').Page, locale: string): Promise<Measurement[]> {
  await page.goto(`/pokedex-builder?lang=${locale}`);
  await page.locator('[data-add-slot]').first().click();
  await page.locator('[data-filter-chip="type"]').first().click();
  const grid = page.locator('[data-testid="type-filter"]');
  await expect(grid.locator('svg[role="img"]')).toHaveCount(18);

  await page.evaluate(() => document.fonts.ready);

  return grid.evaluate((root) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    return Array.from(root.querySelectorAll('svg[role="img"]')).map((svg) => {
      const text = svg.querySelector('text') as SVGTextElement;
      const label = text.textContent ?? '';

      const style = getComputedStyle(text);
      const fontSize = parseFloat(text.getAttribute('font-size') ?? style.fontSize);
      const baseline = parseFloat(text.getAttribute('y') ?? '0');
      const scaleX = (svg.querySelector('g') as SVGGElement).transform.baseVal.consolidate()?.matrix.a ?? 1;

      // platform: Canvas actualBoundingBox gives the glyphs' true ink extents; SVG getBBox gives only the font's ascent and descent.
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

      expect(rows.filter((r) => !r.label.trim())).toEqual([]);

      const overflowing = rows
        .filter((r) => r.fill > 1.002)
        .map((r) => `${r.label} ${(r.fill * 100).toFixed(1)}%`);
      expect(overflowing, 'these words are wider than the pill reserves').toEqual([]);

      const heights = new Set(rows.map((r) => Math.round(r.height)));
      expect([...heights], 'pills rendered at different heights').toHaveLength(1);

      const mean = rows.reduce((a, r) => a + r.inkCenter, 0) / rows.length;
      expect(
        Math.abs(mean - INK_CENTER),
        `${locale} paints its words at ${mean.toFixed(2)}; the art paints them at ${INK_CENTER}`,
      ).toBeLessThan(1.5);

      const CJK_LOCALES = ['ja', 'ko', 'zh-Hans', 'zh-Hant'];
      const targetBand = CJK_LOCALES.includes(locale) ? CAP_HEIGHT * 1.28 : CAP_HEIGHT;
      const meanInk = rows.reduce((a, r) => a + r.inkHeight, 0) / rows.length;
      expect(
        Math.abs(meanInk - targetBand),
        `${locale} paints a ${meanInk.toFixed(1)}-unit band; the target is ${targetBand.toFixed(1)}`,
      ).toBeLessThan(4);

      const clipped = rows.filter(
        (r) => r.inkCenter - r.inkHeight / 2 < 0 || r.inkCenter + r.inkHeight / 2 > TYPE_BADGE_H,
      );
      expect(clipped.map((r) => r.label), 'these words overflow the pill vertically').toEqual([]);

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
