import { describe, expect, it } from 'vitest';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { contrastWithWhite, deltaE2000 } from './colorMetrics';
import { cardShades } from './theme';

const MIN_SEPARATION = 5;

const CELL_CONTRAST_WCAG_AA_LARGE_TEXT = 3;
const BAND_CONTRAST_WCAG_AA_NORMAL_TEXT = 4.5;

function closestPair(key: 'cell' | 'band'): { pair: string; distance: number } {
  let worst = { pair: '', distance: Infinity };
  for (let i = 0; i < TYPE_NAMES.length; i++) {
    for (let j = i + 1; j < TYPE_NAMES.length; j++) {
      const distance = deltaE2000(cardShades(TYPE_NAMES[i])[key], cardShades(TYPE_NAMES[j])[key]);
      if (distance < worst.distance) {
        worst = { pair: `${TYPE_NAMES[i]}/${TYPE_NAMES[j]}`, distance };
      }
    }
  }
  return worst;
}

const between = (a: TypeName, b: TypeName, key: 'cell' | 'band') =>
  deltaE2000(cardShades(a)[key], cardShades(b)[key]);

describe('card shades', () => {
  it('keeps every pair of glyph cells visibly apart', () => {
    const worst = closestPair('cell');
    expect(worst.distance, `closest cells: ${worst.pair}`).toBeGreaterThan(MIN_SEPARATION);
  });

  it('keeps every pair of spacer bands visibly apart', () => {
    const worst = closestPair('band');
    expect(worst.distance, `closest bands: ${worst.pair}`).toBeGreaterThan(MIN_SEPARATION);
  });

  it('separates the pairs that collided under a fixed target', () => {
    expect(between('fighting', 'ground', 'cell')).toBeGreaterThan(10);
    expect(between('ghost', 'fairy', 'cell')).toBeGreaterThan(10);
    expect(between('ice', 'steel', 'cell')).toBeGreaterThan(MIN_SEPARATION);
  });

  it('spreads the ramp instead of pinning every type to one lightness', () => {
    const contrasts = TYPE_NAMES.map((t) => contrastWithWhite(cardShades(t).cell));
    expect(Math.max(...contrasts) - Math.min(...contrasts)).toBeGreaterThan(2);
  });

  it('keeps white legible on every cell and band', () => {
    for (const type of TYPE_NAMES) {
      const shades = cardShades(type);
      expect(contrastWithWhite(shades.cell), `${type} cell`).toBeGreaterThanOrEqual(CELL_CONTRAST_WCAG_AA_LARGE_TEXT);
      expect(contrastWithWhite(shades.band), `${type} band`).toBeGreaterThanOrEqual(BAND_CONTRAST_WCAG_AA_NORMAL_TEXT);
    }
  });

  it('gives the no-type ramp the same shape', () => {
    expect(cardShades('none')).toEqual(cardShades(null));
    expect(contrastWithWhite(cardShades('none').cell)).toBeGreaterThanOrEqual(CELL_CONTRAST_WCAG_AA_LARGE_TEXT);
  });

  it('paints hover-on-white as a pale tint, not the glyph cell', () => {
    for (const type of TYPE_NAMES) {
      const s = cardShades(type);
      expect(contrastWithWhite(s.hoverOnWhite), `${type} hoverOnWhite`).toBeLessThan(1.5);
      expect(contrastWithWhite(s.cell)).toBeGreaterThan(contrastWithWhite(s.hoverOnWhite));
    }
  });
});
