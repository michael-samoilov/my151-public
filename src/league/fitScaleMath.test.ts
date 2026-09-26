import { describe, expect, it } from 'vitest';
import { proposeFit, stabilizeMeasure, SCALE_EPS, WIDTH_EPS } from './fitScaleMath';

/**
 * Values from the forced-avail vibration repro @ 912×705 (Firefox):
 * avail alternated 578.47 ↔ 572.47 with natural ≈ 917.5, producing
 * next ≈ 0.630 ↔ 0.624 (Δ ≈ 0.0067) — above the old 0.003 deadband.
 */
const A = {
  mode: 'squash' as const,
  natural: 917.51,
  tailNatural: 40,
  avail: 578.47,
  room: 474.924,
  floor: 0.55,
};
const B = { ...A, avail: 572.47 };

describe('proposeFit', () => {
  it('stabilizeMeasure holds wrap-driven natural flicker (~15px)', () => {
    expect(stabilizeMeasure(905, 890)).toBe(890);
  });

  it('absorbs the measured avail-flicker pair instead of oscillating', () => {
    const avail = stabilizeMeasure(B.avail, A.avail);
    const first = proposeFit({ ...A, prevScale: 1, prevWidth: 0 });
    expect(first).not.toBeNull();
    const second = proposeFit({
      ...B,
      avail,
      prevScale: first!.scale,
      prevWidth: first!.width,
    });
    expect(second).toBeNull();
    expect(SCALE_EPS).toBeGreaterThanOrEqual(0.015);
    expect(WIDTH_EPS).toBeGreaterThanOrEqual(2);
  });
});
