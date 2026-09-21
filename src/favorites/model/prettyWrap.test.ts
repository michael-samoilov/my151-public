import { describe, expect, it } from 'vitest';
import { prettyGridCols, prettyRowSizes, prettyWrapLabel } from './prettyWrap';

/** Real type×gen cells whose eligible lists match iterate-8 wrap counts. */
const I8_CASES: { n: number; want: string }[] = [
  { n: 5, want: '5 → 5' },
  { n: 7, want: '7 → 4+3' },
  { n: 8, want: '8 → 4+4' },
  { n: 11, want: '11 → 4+4+3' },
  { n: 13, want: '13 → 5+5+3' },
  { n: 16, want: '16 → 4+4+4+4' },
  { n: 17, want: '17 → 6+6+5' },
  { n: 19, want: '19 → 5+5+5+4' },
];

describe('prettyGridCols', () => {
  it('keeps 16 as 4×4 instead of expanding', () => {
    expect(prettyGridCols(16)).toBe(4);
  });

  it('expands 17 to 6 so the last row is 5, not 2', () => {
    expect(prettyGridCols(17)).toBe(6);
    expect(prettyRowSizes(17)).toEqual([6, 6, 5]);
  });

  it('matches the iterate-8 wrap labels', () => {
    for (const { n, want } of I8_CASES) {
      expect(prettyWrapLabel(n), `n=${n}`).toBe(want);
    }
  });

  it('never leaves a last row of 1–2 when there is more than one row', () => {
    for (let n = 1; n <= 24; n++) {
      const sizes = prettyRowSizes(n);
      if (sizes.length > 1) {
        expect(sizes[sizes.length - 1], `n=${n}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
