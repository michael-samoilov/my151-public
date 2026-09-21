import { describe, expect, it } from 'vitest';
import { prettyGridCols, prettyRowSizes, prettyWrapLabel, SELECTOR_MAX_COLS } from './prettyWrap';

const CASES: { n: number; want: string }[] = [
  { n: 3, want: '3 → 3' },
  { n: 5, want: '5 → 5' },
  { n: 7, want: '7 → 4+3' },
  { n: 8, want: '8 → 4+4' },
  { n: 9, want: '9 → 5+4' },
  { n: 11, want: '11 → 6+5' },
  { n: 13, want: '13 → 6+4+3' },
  { n: 16, want: '16 → 6+5+5' },
  { n: 17, want: '17 → 6+6+5' },
  { n: 19, want: '19 → 6+6+4+3' },
  { n: 22, want: '22 → 6+6+5+5' },
  { n: 32, want: '32 → 6+6+6+6+4+4' },
];

describe('prettyGridCols', () => {
  it('caps every row at 6', () => {
    expect(SELECTOR_MAX_COLS).toBe(6);
    for (let n = 1; n <= 40; n++) {
      const sizes = prettyRowSizes(n);
      expect(Math.max(...sizes), `n=${n}`).toBeLessThanOrEqual(6);
      expect(prettyGridCols(n, 8), `asked 8, n=${n}`).toBeLessThanOrEqual(6);
    }
  });

  it('keeps a count of 6 or fewer on one row', () => {
    expect(prettyRowSizes(6)).toEqual([6]);
    expect(prettyRowSizes(1)).toEqual([1]);
  });

  it('does not turn a long list into a run of 4-column rows', () => {
    expect(prettyRowSizes(32)).toEqual([6, 6, 6, 6, 4, 4]);
    expect(prettyRowSizes(16)).toEqual([6, 5, 5]);
  });

  it('matches the selector row labels', () => {
    for (const { n, want } of CASES) {
      expect(prettyWrapLabel(n), `n=${n}`).toBe(want);
    }
  });

  it('moves the tail only when the last row gets closer to the row above', () => {
    for (let n = 7; n <= 40; n++) {
      const sizes = prettyRowSizes(n);
      if (sizes.length < 2) continue;
      const last = sizes[sizes.length - 1];
      const prev = sizes[sizes.length - 2];
      expect(last, `n=${n}`).toBeGreaterThanOrEqual(3);
      expect(Math.abs(last - prev), `n=${n}`).toBeLessThanOrEqual(1);
    }
  });
});
