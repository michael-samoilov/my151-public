import { describe, expect, it } from 'vitest';
import { sankeyGeometry } from './sankeyGeometry';

describe('sankeyGeometry', () => {
  it('keeps a phone-width funnel plot wider than the pads', () => {
    const g = sankeyGeometry(326, 'funnel');
    expect(g.compact).toBe(true);
    expect(g.left + g.right).toBeLessThan(40);
    expect(326 - g.left - g.right).toBeGreaterThan(280);
  });

  it('keeps referrer host labels in the left pad on a phone', () => {
    const g = sankeyGeometry(326, 'referrer');
    expect(g.compact).toBe(true);
    expect(g.left).toBeGreaterThanOrEqual(72);
    expect(326 - g.left - g.right).toBeGreaterThan(180);
  });

  it('uses the wide desktop pads once the chart is roomy', () => {
    const g = sankeyGeometry(960, 'funnel');
    expect(g.compact).toBe(false);
    expect(g.left).toBe(108);
  });
});
