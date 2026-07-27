/**
 * The row contract for ButterflyChart. Kept out of the component file so the
 * data builders (typeDistribution, useDetailedStatsData) and the canvas export
 * can import `rowKey` without pulling in a React component — and so
 * react-refresh isn't asked to hot-reload a module that exports both.
 */
export interface ButterflyRow {
  /** Stable identity for this row — the underlying datum (a type slug, a
   *  generation number, a shape key), never the display text. This is what
   *  `onBarClick` hands back and what `activeKey` is matched against, so a row
   *  can be identified without parsing its label. Defaults to `label` for rows
   *  whose label already is the datum. */
  key?: string;
  label: string;
  count: number;
  deviation: number; // percentage, e.g. +100 = double, -50 = half (or raw diff in scoreMode)
  color: string;
  /** Optional icon path (e.g. "/types/fire.svg") or inline SVG render function */
  icon?: string | ((x: number, y: number, size: number) => React.ReactNode);
}

/** A row's stable identity, falling back to its label when none is supplied. */
export function rowKey(row: ButterflyRow): string {
  return row.key ?? row.label;
}
