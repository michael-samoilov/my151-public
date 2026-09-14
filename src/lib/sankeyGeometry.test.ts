import { describe, expect, it } from 'vitest';
import { sankeyColumnXs, sankeyGeometry } from './sankeyGeometry';

describe('sankeyGeometry', () => {
  it('keeps a phone-width funnel plot wider than the pads', () => {
    const g = sankeyGeometry(326, 'funnel');
    expect(g.compact).toBe(true);
    expect(g.left + g.right).toBeLessThan(100);
    expect(326 - g.left - g.right).toBeGreaterThan(220);
  });

  it('keeps referrer host labels in the left pad on a phone', () => {
    const g = sankeyGeometry(326, 'referrer');
    expect(g.compact).toBe(true);
    expect(g.left).toBeGreaterThanOrEqual(88);
    expect(326 - g.left - g.right).toBeGreaterThan(160);
  });

  it('uses the wide desktop pads once the chart is roomy', () => {
    const g = sankeyGeometry(960, 'funnel');
    expect(g.compact).toBe(false);
    expect(g.left).toBeGreaterThanOrEqual(96);
  });
});

describe('sankeyColumnXs', () => {
  it('spaces depths evenly when expandLate is off', () => {
    expect(sankeyColumnXs(4, 300, 8, false)).toEqual([0, 73, 146, 219, 292]);
  });

  it('gives the last hop more width than the first when expandLate is on', () => {
    const xs = sankeyColumnXs(4, 300, 8, true);
    expect(xs).toHaveLength(5);
    expect(xs[0]).toBe(0);
    expect(xs[4]).toBeCloseTo(292, 5);
    const firstGap = xs[1] - xs[0];
    const lastGap = xs[4] - xs[3];
    expect(lastGap).toBeGreaterThan(firstGap * 2);
  });
});
