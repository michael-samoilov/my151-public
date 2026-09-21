import { describe, expect, it } from 'vitest';
import {
  FOIL_HOLO_AMOUNT,
  FOIL_HOLO_BLEND,
  FOIL_HOLO_TINT,
  foilComposite,
  luma,
  pickHoloBlend,
  scoreHoloBlend,
} from './foilBlend';

const GRASS = { r: 40, g: 160, b: 40 };

describe('foil holographic blend', () => {
  it('multiply at 0.40 darkens grass ink by more than a poster match', () => {
    const out = foilComposite(GRASS, FOIL_HOLO_TINT, 'multiply', 0.4);
    expect(luma(GRASS.r, GRASS.g, GRASS.b) - luma(out.r, out.g, out.b)).toBeGreaterThan(18);
  });

  it('soft-light keeps grass luminance close and still shifts a channel', () => {
    const out = foilComposite(GRASS, FOIL_HOLO_TINT, FOIL_HOLO_BLEND, FOIL_HOLO_AMOUNT);
    expect(FOIL_HOLO_BLEND).toBe('soft-light');
    expect(Math.abs(luma(out.r, out.g, out.b) - luma(GRASS.r, GRASS.g, GRASS.b))).toBeLessThan(12);
    expect(Math.abs(out.r - GRASS.r) + Math.abs(out.g - GRASS.g) + Math.abs(out.b - GRASS.b)).toBeGreaterThan(24);
  });

  it('picks a bright visible blend and rejects multiply', () => {
    const winner = pickHoloBlend(FOIL_HOLO_AMOUNT);
    expect(winner.mode).not.toBe('multiply');
    expect(winner.bright).toBe(true);
    expect(winner.visible).toBe(true);
    expect(winner.mode).toBe(FOIL_HOLO_BLEND);
    expect(scoreHoloBlend('multiply', 0.4).bright).toBe(false);
  });
});
