import v1Numbers from '@/data/generated/picker-v1-numbers.json';

export const FAVORITES_STORE_VERSION = 5;
const FIRST_LEDGER_STORE_VERSION = 5;
const LEDGER_NUMBER_BY_V1: Readonly<Record<string, number>> = v1Numbers;

export const ledgerNumber = (v1: number): number => LEDGER_NUMBER_BY_V1[v1] ?? v1;

export function ledgerPicks(picks: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(picks).map(([cell, id]) => [cell, ledgerNumber(id)]));
}

export function savedFavoriteFills(raw: string | null): Record<string, number> | null {
  let saved: unknown;
  try {
    saved = JSON.parse(raw ?? 'null');
  } catch {
    return null;
  }
  if (!saved || typeof saved !== 'object' || !('state' in saved)) return null;
  const { state } = saved;
  if (!state || typeof state !== 'object' || !('fills' in state)) return null;
  const { fills } = state;
  if (!fills || typeof fills !== 'object' || Array.isArray(fills)) return null;
  const numbers = Object.fromEntries(Object.entries(fills).filter((entry): entry is [string, number] =>
    typeof entry[1] === 'number' && Number.isSafeInteger(entry[1])));
  const version = 'version' in saved && typeof saved.version === 'number' ? saved.version : 0;
  return version < FIRST_LEDGER_STORE_VERSION ? ledgerPicks(numbers) : numbers;
}
