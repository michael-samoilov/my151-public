// keeps: a gen badge fill under unoutlined white text that reads worse than every type badge. E2E checks no colours.
import { expect, it } from 'vitest';
import { TYPE_COLORS } from '@/data/type-colors';
import { GEN_BADGE_FILL, generationOutlined } from './badgeStyle';
import type { GenNumber } from '../model/cells';

// WCAG 2 contrast of white text on a fill.
function onWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

it('reads every unoutlined gen badge segment at least as well as the palest type badge', () => {
  const floor = Math.min(...Object.values(TYPE_COLORS).map(onWhite));
  const short = Object.entries(GEN_BADGE_FILL)
    .filter(([gen]) => !generationOutlined(Number(gen) as GenNumber))
    .flatMap(([gen, stops]) => stops.filter(([, color]) => onWhite(color) < floor).map(([, color]) => `Gen ${gen} ${color}`));
  expect(short).toEqual([]);
});
