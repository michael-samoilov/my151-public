import { describe, expect, it } from 'vitest';
import { categoryIndexAtX, clampToRect, lineLeftInPlot, tipDataIndex } from './scrubPlot';

const plot = { x: 36, y: 36, width: 200, height: 100 };

describe('clampToRect', () => {
  it('leaves a point inside the plot alone', () => {
    expect(clampToRect(100, 80, plot)).toEqual({ x: 100, y: 80 });
  });
});

describe('lineLeftInPlot', () => {
  it('keeps a 1px line inside the plot, including the right edge', () => {
    expect(lineLeftInPlot(100, plot)).toBe(100);
    expect(lineLeftInPlot(8, plot)).toBe(36);
    expect(lineLeftInPlot(250, plot)).toBe(235);
  });
});

describe('tipDataIndex', () => {
  it('prefers a line series over a silent custom series', () => {
    expect(
      tipDataIndex([
        { seriesType: 'custom', dataIndex: 0 },
        { seriesType: 'line', dataIndex: 41 },
      ]),
    ).toBe(41);
  });

  it('accepts a single payload object', () => {
    expect(tipDataIndex({ seriesType: 'line', dataIndex: 7 })).toBe(7);
  });
});

describe('categoryIndexAtX', () => {
  it('maps the left edge to 0 and the right edge to lastIndex', () => {
    expect(categoryIndexAtX(36, plot, 90)).toBe(0);
    expect(categoryIndexAtX(236, plot, 90)).toBe(90);
  });

  it('maps the midline to the middle category', () => {
    expect(categoryIndexAtX(136, plot, 90)).toBe(45);
  });
});
