import { describe, expect, it } from 'vitest';
import {
  chroma,
  FOIL_HOLO_AMOUNT,
  FOIL_HOLO_BLEND,
  FOIL_HOLO_BLEND_CANDIDATES,
  FOIL_HOLO_STRIPES,
  FOIL_HOLO_TINT,
  FOIL_POSTER_INKS,
  foilComposite,
  isFoilHoloBlend,
  luma,
  pickHoloBlend,
  scoreHoloBlend,
} from './foilBlend';

describe('foil holographic blend', () => {
  it('multiply at 0.40 darkens grass ink by more than a poster match', () => {
    const grass = FOIL_POSTER_INKS[0]!;
    const out = foilComposite(grass, FOIL_HOLO_TINT, 'multiply', 0.4);
    expect(luma(grass.r, grass.g, grass.b) - luma(out.r, out.g, out.b)).toBeGreaterThan(18);
  });

  it('hue keeps chroma and luma on every poster ink', () => {
    expect(FOIL_HOLO_BLEND).toBe('hue');
    expect(FOIL_HOLO_AMOUNT).toBe(1);
    expect(isFoilHoloBlend(FOIL_HOLO_BLEND)).toBe(true);
    expect(FOIL_HOLO_BLEND_CANDIDATES).toContain('hue');
    for (const ink of FOIL_POSTER_INKS) {
      let maxShift = 0;
      for (const stripe of FOIL_HOLO_STRIPES) {
        const hue = foilComposite(ink, stripe, 'hue', FOIL_HOLO_AMOUNT);
        const baseChroma = chroma(ink.r, ink.g, ink.b);
        const hueChroma = chroma(hue.r, hue.g, hue.b);
        const wall = hue.r === 0 || hue.r === 255 || hue.g === 0 || hue.g === 255 || hue.b === 0 || hue.b === 255;
        expect(Math.abs(luma(hue.r, hue.g, hue.b) - luma(ink.r, ink.g, ink.b)), ink.name).toBeLessThan(12);
        expect(hueChroma / Math.max(1, baseChroma) >= 0.85 || wall, ink.name).toBe(true);
        maxShift = Math.max(
          maxShift,
          Math.abs(hue.r - ink.r) + Math.abs(hue.g - ink.g) + Math.abs(hue.b - ink.b),
        );
      }
      expect(maxShift, ink.name).toBeGreaterThan(16);
    }
    const grass = FOIL_POSTER_INKS[0]!;
    const faded = foilComposite(grass, FOIL_HOLO_TINT, 'hue', 0.55);
    expect(chroma(faded.r, faded.g, faded.b) / chroma(grass.r, grass.g, grass.b)).toBeLessThan(0.85);
  });

  it('picks a bright visible blend and rejects multiply', () => {
    const winner = pickHoloBlend(FOIL_HOLO_AMOUNT);
    expect(winner.mode).not.toBe('multiply');
    expect(winner.bright).toBe(true);
    expect(winner.visible).toBe(true);
    expect(winner.mode).toBe(FOIL_HOLO_BLEND);
    expect(scoreHoloBlend('multiply', 0.4).bright).toBe(false);
    expect(scoreHoloBlend('soft-light', FOIL_HOLO_AMOUNT).satDelta).toBeGreaterThan(
      scoreHoloBlend('hue', FOIL_HOLO_AMOUNT).satDelta,
    );
  });
});
