import { describe, expect, it } from 'vitest';
import {
  HOVER_TILT_EXIT_SPRING,
  HOVER_TILT_ROTATION,
  HOVER_TILT_SPRING,
  applySpringOpts,
  createSpring,
  hoverTiltFromNormalized,
  hoverTiltFromPointer,
  pointInBox,
  pokeHoloIdle,
  tickSpring,
} from './hoverTilt';

const box = { left: 0, top: 0, width: 400, height: 400 };

describe('hoverTiltFromPointer', () => {
  it('keeps the center facing the user', () => {
    const pose = hoverTiltFromPointer(200, 200, box);
    expect(pose.rotateX).toBeCloseTo(0);
    expect(pose.rotateY).toBeCloseTo(0);
    expect(pose.nx).toBeCloseTo(0.5);
    expect(pose.ny).toBeCloseTo(0.5);
  });

  it('matches hover-tilt ±10° at the edge when tiltFactor is 1', () => {
    const right = hoverTiltFromPointer(400, 200, box);
    expect(right.rotateY).toBeCloseTo(-HOVER_TILT_ROTATION);
    expect(right.rotateX).toBeCloseTo(0);
    expect(right.nx).toBeCloseTo(1);
    const bottom = hoverTiltFromPointer(200, 400, box);
    expect(bottom.rotateX).toBeCloseTo(HOVER_TILT_ROTATION);
    expect(bottom.rotateY).toBeCloseTo(0);
  });

  it('does not use the poke-holo 50/3.5 edge (~14.3°)', () => {
    const pose = hoverTiltFromPointer(400, 200, box);
    expect(Math.abs(pose.rotateY)).toBeLessThan(11);
    expect(Math.abs(pose.rotateY)).not.toBeCloseTo(50 / 3.5, 1);
  });

  it('dips the top-left corner, not the whole card away', () => {
    const pose = hoverTiltFromPointer(0, 0, box);
    expect(pose.rotateY).toBeCloseTo(HOVER_TILT_ROTATION);
    expect(pose.rotateX).toBeCloseTo(-HOVER_TILT_ROTATION);
  });

  it('scales with native hover-tilt tiltFactor, not degree-as-factor', () => {
    const pose = hoverTiltFromNormalized(1, 0.5, { tiltFactor: 2, tiltFactorY: 0.5 });
    expect(pose.rotateY).toBeCloseTo(-20);
    expect(pose.rotateX).toBeCloseTo(0);
    const bottom = hoverTiltFromNormalized(0.5, 1, { tiltFactor: 2, tiltFactorY: 0.5 });
    expect(bottom.rotateX).toBeCloseTo(5);
  });
});

describe('hover-tilt springs', () => {
  it('uses hover-tilt stiffness 0.2 / damping 0.8, softer on exit', () => {
    expect(HOVER_TILT_SPRING).toEqual({ stiffness: 0.2, damping: 0.8, precision: 0.001 });
    expect(HOVER_TILT_EXIT_SPRING.stiffness).toBeCloseTo(0.04);
    expect(HOVER_TILT_EXIT_SPRING.damping).toBeCloseTo(0.4);
  });

  it('eases toward the target across rAF ticks instead of snapping', () => {
    const spring = createSpring(0.5);
    spring.target = 1;
    tickSpring(spring, 16);
    expect(spring.value).toBeGreaterThan(0.5);
    expect(spring.value).toBeLessThan(0.95);
    for (let i = 0; i < 80; i++) tickSpring(spring, 16);
    expect(spring.value).toBeCloseTo(1, 2);
  });

  it('exit opts ease back to rest instead of jumping to 0', () => {
    const spring = createSpring(0.9);
    applySpringOpts(spring, HOVER_TILT_EXIT_SPRING);
    spring.target = 0.5;
    tickSpring(spring, 16);
    expect(spring.value).toBeGreaterThan(0.7);
    expect(spring.value).toBeLessThan(0.9);
  });
});

describe('pointInBox', () => {
  it('keeps hover live on the painted card AABB, not only the rest box', () => {
    const rest = { left: 100, top: 100, width: 200, height: 200 };
    const painted = { left: 80, top: 90, width: 260, height: 240 };
    expect(pointInBox(90, 120, rest)).toBe(false);
    expect(pointInBox(90, 120, painted)).toBe(true);
  });
});

describe('pokeHoloIdle', () => {
  const idle = {
    origin: 0,
    idleMsX: 14000,
    idleMsY: 14000,
    idleTilt: 10,
  };

  it('matches production league export: in-phase sin on both axes', () => {
    const peak = pokeHoloIdle({ ...idle, now: 3500 });
    expect(peak.rotateX).toBeCloseTo(10, 5);
    expect(peak.rotateY).toBeCloseTo(10, 5);
    expect(Math.hypot(peak.rotateX, peak.rotateY)).toBeCloseTo(10 * Math.SQRT2, 5);
    const start = pokeHoloIdle({ ...idle, now: 0 });
    expect(Math.hypot(start.rotateX, start.rotateY)).toBeCloseTo(0, 5);
  });

  it('completes one cycle in the production period', () => {
    const a = pokeHoloIdle({ ...idle, now: 1000 });
    const b = pokeHoloIdle({ ...idle, now: 15000 });
    expect(a.rotateX).toBeCloseTo(b.rotateX, 5);
    expect(a.rotateY).toBeCloseTo(b.rotateY, 5);
  });

  it('moves while the pointer stays frozen', () => {
    const a = pokeHoloIdle({ ...idle, now: 2000 });
    const b = pokeHoloIdle({ ...idle, now: 4000 });
    expect(Math.hypot(b.rotateX - a.rotateX, b.rotateY - a.rotateY)).toBeGreaterThan(2);
  });
});
