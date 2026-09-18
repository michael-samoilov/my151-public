import { describe, expect, it } from 'vitest';
import { pokeHoloFromPointer, pokeHoloIdle, REST_POSE } from './hoverTilt';

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
    idleMsX: 4000,
    idleMsY: 4000,
    idleTilt: 10,
  };

  it('starts already tilted so a person can see it without moving the mouse', () => {
    const pose = pokeHoloIdle({ ...idle, now: 0 });
    expect(Math.hypot(pose.rotateX, pose.rotateY)).toBeGreaterThan(6);
    expect(pose).not.toEqual(REST_POSE);
  });

  it('matches poke-holo showcase amplitude at 25deg', () => {
    const pose = pokeHoloIdle({
      now: 0,
      origin: 0,
      idleMsX: 2500,
      idleMsY: 2500,
      idleTilt: 25,
    });
    expect(pose.rotateX).toBeCloseTo(25);
    expect(pose.rotateY).toBeCloseTo(0);
  });

  it('moves while the pointer stays frozen', () => {
    const a = pokeHoloIdle({ ...idle, now: 0 });
    const b = pokeHoloIdle({ ...idle, now: 800 });
    expect(Math.hypot(b.rotateX - a.rotateX, b.rotateY - a.rotateY)).toBeGreaterThan(2);
  });
});
