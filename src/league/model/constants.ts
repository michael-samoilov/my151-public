export const ROW_COUNT = 11;

export const TEAM_SIZES = [2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6] as const;

export const LEVEL_CURVE = [12, 18, 25, 32, 34, 40, 46, 48, 54, 58, 80] as const;

export const ELITE_ROW = 9;
export const CHAMPION_ROW = 10;
export const BOSS_ROW = 11;

export function joinRow(seat: number): number {
  for (let row = 1; row <= ROW_COUNT; row++) {
    if (TEAM_SIZES[row - 1] >= seat) return row;
  }
  return ROW_COUNT;
}

type SlotKind = 'gym' | 'elite' | 'champion' | 'boss';

export const SLOT_COUNT = 14;

export function slotKind(slotIndex: number): SlotKind {
  if (slotIndex < 8) return 'gym';
  if (slotIndex < 12) return 'elite';
  if (slotIndex === 12) return 'champion';
  return 'boss';
}

export function slotRow(slotIndex: number): number {
  const kind = slotKind(slotIndex);
  if (kind === 'gym') return slotIndex + 1;
  if (kind === 'elite') return ELITE_ROW;
  if (kind === 'champion') return CHAMPION_ROW;
  return BOSS_ROW;
}
