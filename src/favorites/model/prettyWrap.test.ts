import { describe, expect, it } from 'vitest';
import { evolutionLineKey } from './catalog';
import { eligibleFor } from './eligibility';
import { prettyGridCols, prettyRowSizes, prettyRows, prettyWrapLabel, SELECTOR_MAX_COLS } from './prettyWrap';

const CASES: { n: number; want: string }[] = [
  { n: 3, want: '3 → 3' },
  { n: 5, want: '5 → 5' },
  { n: 7, want: '7 → 4+3' },
  { n: 8, want: '8 → 4+4' },
  { n: 9, want: '9 → 5+4' },
  { n: 11, want: '11 → 6+5' },
  { n: 13, want: '13 → 5+4+4' },
  { n: 14, want: '14 → 5+5+4' },
  { n: 16, want: '16 → 6+5+5' },
  { n: 17, want: '17 → 6+6+5' },
  { n: 19, want: '19 → 5+5+5+4' },
  { n: 22, want: '22 → 6+6+5+5' },
  { n: 32, want: '32 → 6+6+5+5+5+5' },
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

  it('spreads a long list so row lengths differ by at most 1', () => {
    expect(prettyRowSizes(32)).toEqual([6, 6, 5, 5, 5, 5]);
    expect(prettyRowSizes(14)).toEqual([5, 5, 4]);
    expect(prettyRowSizes(16)).toEqual([6, 5, 5]);
  });

  it('matches the spread row labels', () => {
    for (const { n, want } of CASES) {
      expect(prettyWrapLabel(n), `n=${n}`).toBe(want);
    }
  });

  it('uses as few rows as possible and keeps lengths within 1', () => {
    for (let n = 1; n <= 40; n++) {
      const sizes = prettyRowSizes(n);
      expect(sizes.reduce((sum, len) => sum + len, 0), `n=${n}`).toBe(n);
      const min = Math.min(...sizes);
      const max = Math.max(...sizes);
      expect(max - min, `n=${n}`).toBeLessThanOrEqual(1);
      expect(sizes.length, `n=${n}`).toBe(Math.ceil(n / SELECTOR_MAX_COLS));
    }
  });

  it('keeps a starter evolution line whole and prefers two lines on a row', () => {
    const starters = eligibleFor('starter', 1);
    const rows = prettyRows(starters, 6, evolutionLineKey);
    expect(rows.map((row) => row.length)).toEqual([6, 3]);
    expect(rows[0].map((mon) => mon.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows[1].map((mon) => mon.id)).toEqual([7, 8, 9]);
  });

  it('packs a leftover starter line with the regional forms that fit', () => {
    const starters = eligibleFor('starter', 8);
    const rows = prettyRows(starters, 6, evolutionLineKey);
    expect(rows.map((row) => row.length)).toEqual([6, 6]);
    for (const row of rows) {
      const keys = row.map(evolutionLineKey);
      const lines = new Set(keys);
      for (const key of lines) {
        const inCell = starters.filter((mon) => evolutionLineKey(mon) === key);
        const onRow = row.filter((mon) => evolutionLineKey(mon) === key);
        expect(onRow.length, `line ${key}`).toBe(inCell.length);
      }
    }
  });
});
