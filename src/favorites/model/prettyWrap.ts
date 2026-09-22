/**
 * Picker rows. At most 6 tiles.
 *
 * A plain list keeps full rows until the tail. Widths run from 6 down to 3.
 * A remainder of 1 or 2 folds into the previous row only. A width is rejected
 * when the short rows outnumber the full rows, or the short rows are not a
 * suffix. The chosen width is the one whose first short row starts latest.
 * A starter list does not split an evolution line, so nine starters are 6+3.
 */

export const SELECTOR_MAX_COLS = 6;

function clampCap(maxCols: number): number {
  const asked = Math.floor(Number(maxCols) || SELECTOR_MAX_COLS);
  return Math.max(1, Math.min(SELECTOR_MAX_COLS, asked));
}

const MIN_WIDTH = 3;

function rowsAtWidth(count: number, width: number): number[] {
  const full = Math.floor(count / width);
  const rem = count % width;
  if (rem === 0) return Array(full).fill(width);
  if (rem >= 3 || full === 0) return [...Array(full).fill(width), rem];
  const tail = width + rem;
  const high = Math.ceil(tail / 2);
  const low = tail - high;
  return [...Array(full - 1).fill(width), high, low];
}

/** Index of the first row shorter than `cap`. A full grid scores as its length. */
function firstShortStart(rows: readonly number[], cap: number): number {
  const at = rows.findIndex((len) => len < cap);
  return at === -1 ? rows.length : at;
}

function tailOk(rows: readonly number[]): boolean {
  if (rows.length === 0) return true;
  const peak = Math.max(...rows);
  let full = 0;
  let short = 0;
  let seenShort = false;
  for (const len of rows) {
    if (len < peak) {
      seenShort = true;
      short += 1;
    } else if (seenShort) {
      return false;
    } else {
      full += 1;
    }
  }
  return short <= full;
}

export function prettyRowSizes(n: number, maxCols = SELECTOR_MAX_COLS): number[] {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const cap = clampCap(maxCols);
  if (count === 0) return [];

  const minWidth = Math.min(MIN_WIDTH, cap);
  let best: number[] | null = null;
  let bestStart = -1;
  let bestWidth = -1;
  for (let width = cap; width >= minWidth; width -= 1) {
    const rows = rowsAtWidth(count, width);
    if (!tailOk(rows)) continue;
    const start = firstShortStart(rows, cap);
    if (start > bestStart || (start === bestStart && width > bestWidth)) {
      best = rows;
      bestStart = start;
      bestWidth = width;
    }
  }
  return best ?? [count];
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
