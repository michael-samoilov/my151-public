import { describe, expect, it } from 'vitest';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { contrastWithWhite, deltaE2000 } from './colorMetrics';
import { cardShades } from './theme';

/**
 * The card's colours have to separate as well as the types do.
 *
 * Two pairs collided in review — fighting read as ground, steel as ice —
 * because a fixed luminance target discards brightness, the one thing those
 * pairs differ by. The floor lives here rather than in an eye: run
 * `scripts/shade-report.ts` to see the whole ramp behind these numbers.
 *
 * ΔE2000 is the metric. 1 is the just-noticeable difference and 5 reads as a
 * clear difference at a glance, so 5 is the floor a *pair of types* has to
 * clear. The old ramp's worst pair was 3.95.
 */

const MIN_SEPARATION = 5;

/** The cell holds white glyphs and white text (WCAG AA large text). */
const CELL_MIN_CONTRAST = 3;
/** The spacer band holds small bold white text (WCAG AA normal text). */
const BAND_MIN_CONTRAST = 4.5;

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
    // Both sat near ΔE 4 when every cell solved for the same luminance.
    expect(between('fighting', 'ground', 'cell')).toBeGreaterThan(10);
    expect(between('ghost', 'fairy', 'cell')).toBeGreaterThan(10);
    expect(between('ice', 'steel', 'cell')).toBeGreaterThan(MIN_SEPARATION);
  });

  it('spreads the ramp instead of pinning every type to one lightness', () => {
    // The bug this file exists for: eighteen cells within 0.04 of each other.
    const contrasts = TYPE_NAMES.map((t) => contrastWithWhite(cardShades(t).cell));
    expect(Math.max(...contrasts) - Math.min(...contrasts)).toBeGreaterThan(2);
  });

  it('keeps white legible on every cell and band', () => {
    for (const type of TYPE_NAMES) {
      const shades = cardShades(type);
      expect(contrastWithWhite(shades.cell), `${type} cell`).toBeGreaterThanOrEqual(CELL_MIN_CONTRAST);
      expect(contrastWithWhite(shades.band), `${type} band`).toBeGreaterThanOrEqual(BAND_MIN_CONTRAST);
    }
  });

  it('gives the no-type ramp the same shape', () => {
    expect(cardShades('none')).toEqual(cardShades(null));
    expect(contrastWithWhite(cardShades('none').cell)).toBeGreaterThanOrEqual(CELL_MIN_CONTRAST);
  });

  it('paints hover-on-white as a pale tint, not the glyph cell', () => {
    for (const type of TYPE_NAMES) {
      const s = cardShades(type);
      expect(contrastWithWhite(s.hoverOnWhite), `${type} hoverOnWhite`).toBeLessThan(1.5);
      expect(contrastWithWhite(s.cell)).toBeGreaterThan(contrastWithWhite(s.hoverOnWhite));
    }
  });
});
