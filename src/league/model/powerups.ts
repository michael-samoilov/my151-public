import formsData from '../data/powerupForms.json';
import { CHAMPION_ROW, BOSS_ROW, ELITE_ROW } from './constants';

export type PowerupKind = 'mega' | 'dynamax';

export interface PowerupForm {
  id: number;
  label: string;
}

export type PowerupForms = Record<number, Record<PowerupKind, PowerupForm[]>>;

const FORMS = formsData as PowerupForms;

const ALTERNATE_FORMS: PowerupForms = {
  10061: FORMS[670],
  10184: FORMS[849],
  10147: { mega: [{ id: 10318, label: 'Mega Magearna (Original Color)' }], dynamax: [] },
  11006: { mega: [{ id: 10323, label: 'Mega Tatsugiri (Droopy Form)' }], dynamax: [] },
  11007: { mega: [{ id: 10324, label: 'Mega Tatsugiri (Stretchy Form)' }], dynamax: [] },
  10227: { mega: [], dynamax: [{ id: 10227, label: 'Gigantamax Urshifu Rapid Strike' }] },
  10254: FORMS[869],
  10255: FORMS[869],
  10256: FORMS[869],
  10257: FORMS[869],
  10258: FORMS[869],
  10259: FORMS[869],
};

export interface Powerup {
  seat: number;
  kind: PowerupKind;
  index: number;
}

export const POWERUP_ROWS = [ELITE_ROW, CHAMPION_ROW, BOSS_ROW] as const;

export function isPowerupRow(row: number): boolean {
  return row === ELITE_ROW || row === CHAMPION_ROW || row === BOSS_ROW;
}

export type CardPowerups = Partial<Record<number, Powerup[]>>;

export function formsFor(pokemonId: number, kind: PowerupKind): PowerupForm[] {
  return (ALTERNATE_FORMS[pokemonId] ?? FORMS[pokemonId])?.[kind] ?? [];
}

export type PowerupSymbol = PowerupKind | 'primal-kyogre' | 'primal-groudon';

const PRIMAL_ORBS: Readonly<Record<string, PowerupSymbol>> = {
  'Primal Kyogre': 'primal-kyogre',
  'Primal Groudon': 'primal-groudon',
};

export function powerupSymbol(pokemonId: number, kind: PowerupKind): PowerupSymbol {
  for (const form of formsFor(pokemonId, kind)) {
    const orb = PRIMAL_ORBS[form.label];
    if (orb) return orb;
  }
  return kind;
}

export function formAt(
  powerups: readonly Powerup[],
  row: number,
  seat: number,
  pokemonId: number | null,
): PowerupForm | null {
  if (pokemonId === null || !isPowerupRow(row)) return null;
  const powerup = powerups.find((p) => p.seat === seat);
  if (!powerup) return null;
  return formsFor(pokemonId, powerup.kind)[powerup.index] ?? null;
}

export function cyclePowerup(
  current: Powerup | null,
  seat: number,
  kind: PowerupKind,
  pokemonId: number,
): Powerup | null {
  const forms = formsFor(pokemonId, kind);
  if (forms.length === 0) return current;
  if (current && current.seat === seat && current.kind === kind && current.index < forms.length) {
    const next = current.index + 1;
    return next < forms.length ? { seat, kind, index: next } : null;
  }
  return { seat, kind, index: 0 };
}
