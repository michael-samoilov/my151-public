import { describe, expect, it } from 'vitest';
import {
  proposeFit,
  quantizeScale,
  stabilizeMeasure,
  MEASURE_EPS,
  SCALE_EPS,
  WIDTH_EPS,
} from './fitScaleMath';

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
  it('quantizes scale to thousandths', () => {
    expect(quantizeScale(0.6238643477)).toBe(0.624);
  });

  it('stabilizeMeasure holds wrap-driven natural flicker (~15px)', () => {
    expect(stabilizeMeasure(905, 890)).toBe(890);
  });

  it('stabilizeMeasure holds avail flicker and classic scrollbar width', () => {
    expect(MEASURE_EPS).toBeGreaterThanOrEqual(20);
    const held = stabilizeMeasure(B.avail, A.avail);
    expect(held).toBe(A.avail);
    const scrollbar = stabilizeMeasure(A.room - 15, A.room);
    expect(scrollbar).toBe(A.room);
    const real = stabilizeMeasure(A.avail - 30, A.avail);
    expect(real).toBe(A.avail - 30);
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

  it('still moves on a real resize (~30px of avail)', () => {
    const first = proposeFit({ ...A, prevScale: 1, prevWidth: 0 });
    const moved = proposeFit({
      ...A,
      avail: A.avail - 30,
      prevScale: first!.scale,
      prevWidth: first!.width,
    });
    expect(moved).not.toBeNull();
    expect(moved!.scale).toBeLessThan(first!.scale);
  });

  it('grow mode uses the same deadband', () => {
    const first = proposeFit({
      mode: 'grow',
      natural: 946.77,
      avail: 563,
      room: 569,
      floor: 0.55,
      baseWidth: 520,
      spriteCeil: 2,
      prevScale: 1,
      prevWidth: 0,
    });
    expect(first).not.toBeNull();
    const flicker = proposeFit({
      mode: 'grow',
      natural: 946.77,
      avail: 563 + 4,
      room: 569,
      floor: 0.55,
      baseWidth: 520,
      spriteCeil: 2,
      prevScale: first!.scale,
      prevWidth: first!.width,
    });
    expect(flicker).toBeNull();
  });
});
