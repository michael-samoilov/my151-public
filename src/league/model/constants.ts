/**
 * The card's fixed shape. All three tables come from
 * docs/future-tools/league-builder/DECISIONS.md and are adjustable here —
 * never in the UI, and the curve is never shown to the user.
 */

/** Row count: gyms 1–8, Elite Four, Champion, Endgame boss. */
export const ROW_COUNT = 11;

/** Team size per row (1-indexed by row via `TEAM_SIZES[row - 1]`). */
export const TEAM_SIZES = [2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6] as const;

/**
 * Hidden level thresholds per row. A stage shows in a row when its evolution
 * level is at or under the row's threshold. Spread within the owner's
 * difficulty bands (10–14, 18–32, 34–46, 48–57, 56–60, 72–88).
 */
export const LEVEL_CURVE = [12, 18, 25, 32, 34, 40, 46, 48, 54, 58, 80] as const;

/** Card rows that special slots map to. */
export const ELITE_ROW = 9;
export const CHAMPION_ROW = 10;
export const BOSS_ROW = 11;

/** First row whose team size reaches the seat — where a column joins. */
export function joinRow(seat: number): number {
  for (let row = 1; row <= ROW_COUNT; row++) {
    if (TEAM_SIZES[row - 1] >= seat) return row;
  }
  return ROW_COUNT;
}

/** The 14 league slots, in display order. */
export type SlotKind = 'gym' | 'elite' | 'champion' | 'boss';

export const SLOT_COUNT = 14;

export function slotKind(slotIndex: number): SlotKind {
  if (slotIndex < 8) return 'gym';
  if (slotIndex < 12) return 'elite';
  if (slotIndex === 12) return 'champion';
  return 'boss';
}

/** Which card row a league slot displays. Gym N shows row N; every Elite
 *  Four member shows the same row (stars are ordinal, teams don't escalate). */
export function slotRow(slotIndex: number): number {
  const kind = slotKind(slotIndex);
  if (kind === 'gym') return slotIndex + 1;
  if (kind === 'elite') return ELITE_ROW;
  if (kind === 'champion') return CHAMPION_ROW;
  return BOSS_ROW;
}

export function slotLabel(slotIndex: number): string {
  const kind = slotKind(slotIndex);
  if (kind === 'gym') return `Gym ${slotIndex + 1}`;
  if (kind === 'elite') return `Elite Four ${slotIndex - 7}`;
  if (kind === 'champion') return 'Champion';
  return 'Endgame Boss';
}
