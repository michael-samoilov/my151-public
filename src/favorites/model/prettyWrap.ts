/**
 * Picker rows. At most 6 tiles.
 *
 * A plain list uses as few rows as possible. Row lengths differ by at most 1.
 * A starter list does not split an evolution line. Lines pack into those rows,
 * so nine starters (three lines) are 6+3.
 */

export const SELECTOR_MAX_COLS = 6;

function clampCap(maxCols: number): number {
  const asked = Math.floor(Number(maxCols) || SELECTOR_MAX_COLS);
  return Math.max(1, Math.min(SELECTOR_MAX_COLS, asked));
}

export function prettyRowSizes(n: number, maxCols = SELECTOR_MAX_COLS): number[] {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const cap = clampCap(maxCols);
  if (count === 0) return [];
  if (count <= cap) return [count];

  const rows = Math.ceil(count / cap);
  const base = Math.floor(count / rows);
  const extra = count - base * rows;
  const sizes: number[] = [];
  for (let i = 0; i < rows; i++) sizes.push(base + (i < extra ? 1 : 0));
  return sizes;
}

export function prettyGridCols(n: number, maxCols = SELECTOR_MAX_COLS): number {
  const sizes = prettyRowSizes(n, maxCols);
  return sizes.reduce((max, len) => Math.max(max, len), 0);
}

export function prettyWrapLabel(n: number, maxCols = SELECTOR_MAX_COLS): string {
  return `${Math.max(0, Math.floor(Number(n) || 0))} → ${prettyRowSizes(n, maxCols).join('+')}`;
}

function lineGroups<T>(items: readonly T[], lineKey: (item: T) => number): T[][] {
  const groups: T[][] = [];
  const index = new Map<number, number>();
  for (const item of items) {
    const key = lineKey(item);
    const at = index.get(key);
    if (at == null) {
      index.set(key, groups.length);
      groups.push([item]);
    } else {
      groups[at].push(item);
    }
  }
  return groups;
}

function packLines<T>(lines: readonly (readonly T[])[], cap: number): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  for (const line of lines) {
    if (row.length > 0 && row.length + line.length > cap) {
      rows.push(row);
      row = [];
    }
    row = row.concat(line);
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/** Split `items` into rows. Pass `lineKey` so a starter line stays whole. */
export function prettyRows<T>(
  items: readonly T[],
  maxCols = SELECTOR_MAX_COLS,
  lineKey?: (item: T) => number,
): T[][] {
  const cap = clampCap(maxCols);
  if (lineKey) return packLines(lineGroups(items, lineKey), cap);

  const sizes = prettyRowSizes(items.length, cap);
  const rows: T[][] = [];
  let i = 0;
  for (const len of sizes) {
    rows.push(items.slice(i, i + len));
    i += len;
  }
  return rows;
}
