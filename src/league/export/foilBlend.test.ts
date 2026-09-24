import { describe, expect, it } from 'vitest';
import {
  chroma,
  FOIL_HOLO_AMOUNT,
  FOIL_HOLO_BLEND,
  FOIL_HOLO_STRIPES,
  FOIL_POSTER_INKS,
  foilComposite,
  luma,
} from './foilBlend';

describe('fixed foil holographic blend', () => {
  it('uses hard-light at the production 0.25 amount', () => {
    expect(FOIL_HOLO_BLEND).toBe('hard-light');
    expect(FOIL_HOLO_AMOUNT).toBe(0.25);
  });

  it('visibly shifts every representative ink without crushing its color', () => {
    for (const ink of FOIL_POSTER_INKS) {
      let maxShift = 0;
      let maxLumaDelta = 0;
      let minChroma = Number.POSITIVE_INFINITY;
      for (const stripe of FOIL_HOLO_STRIPES) {
        const out = foilComposite(ink, stripe);
        maxShift = Math.max(
          maxShift,
          Math.abs(out.r - ink.r) + Math.abs(out.g - ink.g) + Math.abs(out.b - ink.b),
        );
        maxLumaDelta = Math.max(maxLumaDelta, Math.abs(luma(out) - luma(ink)));
        minChroma = Math.min(minChroma, chroma(out));
      }
      expect(maxShift, ink.name).toBeGreaterThan(20);
      expect(maxLumaDelta, ink.name).toBeLessThan(45);
      expect(minChroma, ink.name).toBeGreaterThan(18);
    }
  });
});
