/**
 * Picker rows. At most 6 tiles. A count of 6 or fewer is one row.
 * Above 6, rows are 6 wide. The last two rows split their tiles when that
 * puts the last row closer to the row above it. A long list does not drop
 * to 4 columns for every row.
 */

export const SELECTOR_MAX_COLS = 6;

function clampCap(maxCols: number): number {
  const asked = Math.floor(Number(maxCols) || SELECTOR_MAX_COLS);
  return Math.max(1, Math.min(SELECTOR_MAX_COLS, asked));
}

function rowGap(sizes: readonly number[]): number {
  if (sizes.length < 2) return 0;
  return Math.abs(sizes[sizes.length - 1] - sizes[sizes.length - 2]);
}

export function prettyRowSizes(n: number, maxCols = SELECTOR_MAX_COLS): number[] {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const cap = clampCap(maxCols);
  if (count === 0) return [];
  if (count <= cap) return [count];

  const full = Math.floor(count / cap);
  const rem = count % cap;
  if (rem === 0) return Array(full).fill(cap);

  const plain = [...Array(full).fill(cap), rem];
  const tail = cap + rem;
  const high = Math.ceil(tail / 2);
  const low = tail - high;
  const balanced = [...Array(full - 1).fill(cap), high, low];
  return rowGap(balanced) < rowGap(plain) ? balanced : plain;
}

export function prettyGridCols(n: number, maxCols = SELECTOR_MAX_COLS): number {
  const sizes = prettyRowSizes(n, maxCols);
  return sizes.reduce((max, len) => Math.max(max, len), 0);
}

export function prettyWrapLabel(n: number, maxCols = SELECTOR_MAX_COLS): string {
  return `${Math.max(0, Math.floor(Number(n) || 0))} → ${prettyRowSizes(n, maxCols).join('+')}`;
}

/** Split `items` into rows. A short last row stays short. */
export function prettyRows<T>(items: readonly T[], maxCols = SELECTOR_MAX_COLS): T[][] {
  const sizes = prettyRowSizes(items.length, maxCols);
  const rows: T[][] = [];
  let i = 0;
  for (const len of sizes) {
    rows.push(items.slice(i, i + len));
    i += len;
  }
  return rows;
}
