import { describe, expect, it } from 'vitest';
import { pokeHoloFromPointer, pokeHoloIdle } from './hoverTilt';

const box = { left: 0, top: 0, width: 400, height: 400 };

describe('pokeHoloFromPointer', () => {
  it('keeps the center facing the user', () => {
    const pose = pokeHoloFromPointer(200, 200, box, 20);
    expect(pose.rotateX).toBeCloseTo(0);
    expect(pose.rotateY).toBeCloseTo(0);
    expect(pose.pointerX).toBeCloseTo(50);
    expect(pose.pointerY).toBeCloseTo(50);
  });

  it('dips the right edge toward the user', () => {
    const pose = pokeHoloFromPointer(400, 200, box, 20);
    expect(pose.rotateY).toBeLessThan(-10);
    expect(pose.rotateX).toBeCloseTo(0);
  });

  it('dips the bottom edge toward the user', () => {
    const pose = pokeHoloFromPointer(200, 400, box, 20);
    expect(pose.rotateX).toBeGreaterThan(10);
    expect(pose.rotateY).toBeCloseTo(0);
  });

  it('dips the top-left corner, not the whole card away', () => {
    const pose = pokeHoloFromPointer(0, 0, box, 20);
    expect(pose.rotateY).toBeGreaterThan(10);
    expect(pose.rotateX).toBeLessThan(-10);
  });

  it('matches poke-holo 50/3.5 at the edge', () => {
    const pose = pokeHoloFromPointer(400, 200, box, 20);
    expect(pose.rotateY).toBeCloseTo(-(50 / 3.5), 5);
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
