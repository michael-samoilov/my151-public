import { describe, expect, it } from 'vitest';
import {
  SANKEY_DESKTOP_WIDTH,
  sankeyChartHeight,
  sankeyDesktopHeight,
  sankeyGeometry,
} from './sankeyGeometry';

describe('sankeyGeometry', () => {
  it('hugs the left edge on a phone funnel so the plot can be landscape', () => {
    const g = sankeyGeometry(326, 'funnel');
    expect(g.compact).toBe(true);
    expect(g.left).toBeLessThanOrEqual(10);
    expect(g.top).toBeGreaterThanOrEqual(48);
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

describe('sankeyChartHeight', () => {
  it('keeps the desktop funnel height at the md breakpoint and above', () => {
    const league = sankeyDesktopHeight(4, 'funnel');
    expect(league).toBe(520);
    expect(sankeyChartHeight(SANKEY_DESKTOP_WIDTH, 4, 'funnel')).toBe(league);
    expect(sankeyChartHeight(1280, 4, 'funnel')).toBe(league);
  });

  it('makes a phone funnel plot wider than it is tall', () => {
    const width = 326;
    const g = sankeyGeometry(width, 'funnel');
    const h = sankeyChartHeight(width, 4, 'funnel');
    const plotW = width - g.left - g.right;
    const plotH = h - g.top - g.bottom;
    expect(plotW).toBeGreaterThan(plotH);
    expect(h).toBeLessThan(280);
  });
});
