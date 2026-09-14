import { describe, expect, it } from 'vitest';
import {
  SANKEY_DESKTOP_WIDTH,
  sankeyChartHeight,
  sankeyDesktopHeight,
  sankeyGeometry,
} from './sankeyGeometry';

describe('sankeyGeometry', () => {
  it('keeps a phone-width funnel plot wider than the pads', () => {
    const g = sankeyGeometry(326, 'funnel');
    expect(g.compact).toBe(true);
    expect(g.left).toBeGreaterThanOrEqual(56);
    expect(326 - g.left - g.right).toBeGreaterThan(180);
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

describe('sankeyChartHeight', () => {
  it('keeps the desktop funnel height at the md breakpoint and above', () => {
    const league = sankeyDesktopHeight(4, 'funnel');
    expect(league).toBe(520);
    expect(sankeyChartHeight(SANKEY_DESKTOP_WIDTH, 4, 'funnel')).toBe(league);
    expect(sankeyChartHeight(1280, 4, 'funnel')).toBe(league);
  });

  it('floors a phone funnel so labels still fit', () => {
    expect(sankeyChartHeight(390, 4, 'funnel')).toBe(280);
    expect(sankeyChartHeight(390, 6, 'funnel')).toBe(280);
    expect(sankeyChartHeight(390, 6, 'funnel')).toBeLessThan(300);
  });
});
