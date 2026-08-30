/**
 * Mega Evolution and Gigantamax, as the card models them.
 *
 * A powerup is a *form change* of the Pokémon in a seat, never a swap
 * (DECISIONS.md item 8): the line keeps its place and its evolution rows,
 * and only the sprite and the name change on the rows that allow it.
 *
 * Eligibility cannot be derived from the shipped dataset — it has one row
 * per species and no forms — so `powerupForms.json` is harvested from
 * PokeAPI's tables by `npm run league:powerups` and committed.
 */
import formsData from '../data/powerupForms.json';
import { CHAMPION_ROW, BOSS_ROW } from './constants';

export type PowerupKind = 'mega' | 'dynamax';

export interface PowerupForm {
  /** The form's own id, which is also its sprite's filename. */
  id: number;
  /** "Mega Charizard X", "Gigantamax Lapras". */
  label: string;
}

/** Species id → the forms it can take, by powerup. */
export type PowerupForms = Record<number, Record<PowerupKind, PowerupForm[]>>;

const FORMS = formsData as PowerupForms;

/**
 * Which seat holds the card's one powerup, and which form of it.
 *
 * `index` rather than a form id: the seat's Pokémon can change under it — a
 * line is replaced, an evolution boundary moves — and an index still means
 * "the first Mega this Pokémon has" wherever it lands.
 */
export interface Powerup {
  seat: number;
  kind: PowerupKind;
  index: number;
}

/** The rows a powerup may be used on, in card order. */
export const POWERUP_ROWS = [CHAMPION_ROW, BOSS_ROW] as const;

/** The rows a powerup may be used on. */
export function isPowerupRow(row: number): boolean {
  return row === CHAMPION_ROW || row === BOSS_ROW;
}

/**
 * A card's powerups, one per row that allows one.
 *
 * Two rows and one powerup each, because a leader's champion team and their
 * endgame team are the same six Pokemon at different strengths — the same
 * Mega on both is the common case, and a different one on each is a real
 * one.
 */
export type CardPowerups = Partial<Record<number, Powerup | null>>;

/** The forms a species can take under one powerup; empty when it has none. */
export function formsFor(pokemonId: number, kind: PowerupKind): PowerupForm[] {
  return FORMS[pokemonId]?.[kind] ?? [];
}

/** True when a species has any form under either powerup. */
export function hasAnyPowerup(pokemonId: number): boolean {
  const entry = FORMS[pokemonId];
  return !!entry && (entry.mega.length > 0 || entry.dynamax.length > 0);
}

/**
 * The form a cell should draw, or null for the base Pokémon.
 *
 * Returns null whenever the powerup does not apply here — wrong row, wrong
 * seat, or a Pokémon that has no such form, which is what happens when the
 * seat's line is replaced under a powerup that was set for something else.
 */
export function formAt(
  powerup: Powerup | null,
  row: number,
  seat: number,
  pokemonId: number | null,
): PowerupForm | null {
  if (!powerup || pokemonId === null) return null;
  if (powerup.seat !== seat || !isPowerupRow(row)) return null;
  return formsFor(pokemonId, powerup.kind)[powerup.index] ?? null;
}

/**
 * Pressing a powerup button.
 *
 * Cycles that Pokémon's forms and then returns to base, which is what makes
 * one button enough for Charizard's two Megas. Pressing the other powerup,
 * or the same one on another seat, moves the card's single powerup there:
 * the two are mutually exclusive on one Pokémon, and a card has one.
 */
export function cyclePowerup(
  current: Powerup | null,
  seat: number,
  kind: PowerupKind,
  pokemonId: number,
): Powerup | null {
  const forms = formsFor(pokemonId, kind);
  if (forms.length === 0) return current;
  if (current && current.seat === seat && current.kind === kind) {
    const next = current.index + 1;
    return next < forms.length ? { seat, kind, index: next } : null;
  }
  return { seat, kind, index: 0 };
}
