/**
 * Column count for the picker sprite grid. Avoids a last row of 1–2 tiles
 * (CSS `text-wrap: pretty`). Prefers a full last row, then more columns.
 * Tries 2..maxCols first so 16 stays 4×4. If nothing in that range has a
 * last row of 3+, expand up to 8 so 17 becomes 6+6+5, not 5+5+5+2.
 */

const PRETTY_EXPAND_MAX = 8;

function prettyLastLen(count: number, cols: number): number {
  const rem = count % cols;
  return rem === 0 ? cols : rem;
}

function prettyColsOk(count: number, cols: number): boolean {
  const rows = Math.ceil(count / cols);
  const lastLen = prettyLastLen(count, cols);
  return !(rows > 1 && lastLen < 3);
}

function bestPrettyCols(count: number, from: number, to: number): number | null {
  let bestCols: number | null = null;
  let bestRatio = -1;
  const step = from <= to ? 1 : -1;
  for (let cols = from; step > 0 ? cols <= to : cols >= to; cols += step) {
    if (cols < 1 || !prettyColsOk(count, cols)) continue;
    const ratio = prettyLastLen(count, cols) / cols;
    if (bestCols == null || ratio > bestRatio || (ratio === bestRatio && cols > bestCols)) {
      bestRatio = ratio;
      bestCols = cols;
    }
  }
  return bestCols;
}

export function prettyGridCols(n: number, maxCols = 5): number {
  const count = Math.max(0, Number(n) || 0);
  if (count <= 1) return 1;
  if (count <= maxCols) return count;
  const inMax = bestPrettyCols(count, maxCols, 2);
  if (inMax != null) return inMax;
  const expandTo = Math.min(count, Math.max(maxCols + 1, PRETTY_EXPAND_MAX));
  return bestPrettyCols(count, maxCols + 1, expandTo) ?? maxCols;
}

/** Row lengths for a pretty wrap, e.g. 11 → [4, 4, 3]. */
export function prettyRowSizes(n: number, maxCols = 5): number[] {
  const count = Math.max(0, Number(n) || 0);
  if (count === 0) return [];
  const cols = prettyGridCols(count, maxCols);
  const rem = count % cols;
  const fullRows = Math.floor(count / cols);
  const sizes = Array<number>(fullRows).fill(cols);
  if (rem !== 0) sizes.push(rem);
  return sizes;
}

export function prettyWrapLabel(n: number, maxCols = 5): string {
  return `${Math.max(0, Number(n) || 0)} → ${prettyRowSizes(n, maxCols).join('+')}`;
}

/** Split `items` into pretty rows. The last incomplete row is shorter. */
export function prettyRows<T>(items: readonly T[], maxCols = 5): T[][] {
  const sizes = prettyRowSizes(items.length, maxCols);
  const rows: T[][] = [];
  let i = 0;
  for (const len of sizes) {
    rows.push(items.slice(i, i + len) as T[]);
    i += len;
  }
  return rows;
}
