import { describe, expect, it } from 'vitest';
import { drawStars } from './paint';

class Path2DStub {
  constructor(_d?: string) {}
}

function mockCtx() {
  const origins: { x: number; y: number }[] = [];
  const ctx = {
    save() {},
    restore() {},
    translate(x: number, y: number) {
      origins.push({ x, y });
    },
    scale() {},
    fill() {},
    fillStyle: '',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, origins };
}

describe('drawStars', () => {
  it('lays four stars on one row', () => {
    const g = globalThis as { Path2D?: unknown };
    g.Path2D ??= Path2DStub;
    const { ctx, origins } = mockCtx();
    drawStars(ctx, 4, 10, 100, 50, 2);
    expect(origins).toHaveLength(4);
    expect(new Set(origins.map((p) => p.y)).size).toBe(1);
    for (let i = 1; i < origins.length; i++) {
      expect(origins[i]!.x).toBeGreaterThan(origins[i - 1]!.x);
    }
  });
});
