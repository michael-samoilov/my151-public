/**
 * Mega Evolution and Gigantamax, as the card models them. Primal Reversion
 * rides the Mega button, with its own symbol (`powerupSymbol`).
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
import { CHAMPION_ROW, BOSS_ROW, ELITE_ROW } from './constants';

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
export const POWERUP_ROWS = [ELITE_ROW, CHAMPION_ROW, BOSS_ROW] as const;

/** The rows a powerup may be used on. */
export function isPowerupRow(row: number): boolean {
  return row === ELITE_ROW || row === CHAMPION_ROW || row === BOSS_ROW;
}

/**
 * A card's powerups: any number per row, at most one per seat.
 *
 * A row rather than the card holds them because a leader's Elite Four,
 * champion and endgame teams are the same six Pokemon at different
 * strengths, and which of them are powered up can differ between the three.
 * Within a row a seat holds at most one, since Mega and Gigantamax are
 * mutually exclusive on one Pokemon — but every seat in a team may hold one,
 * so a team of six Megas is a card a person can build.
 */
export type CardPowerups = Partial<Record<number, Powerup[]>>;

/** The forms a species can take under one powerup; empty when it has none. */
export function formsFor(pokemonId: number, kind: PowerupKind): PowerupForm[] {
  return (ALTERNATE_FORMS[pokemonId] ?? FORMS[pokemonId])?.[kind] ?? [];
}

/**
 * What a powerup button shows: the Mega or Dynamax symbol, or the orb of a
 * Primal Reversion. Kyogre's and Groudon's forms sit under the Mega button
 * (`powerupForms.json` files them there), but the games mark a Primal with
 * the orb that triggers it, not the Mega symbol: the Blue Orb for Kyogre,
 * the Red Orb for Groudon. Each is `public/powerups/<symbol>.png`.
 */
export type PowerupSymbol = PowerupKind | 'primal-kyogre' | 'primal-groudon';

/** The Primal forms, by the label `powerupForms.json` gives them, and their orbs. */
const PRIMAL_ORBS: Readonly<Record<string, PowerupSymbol>> = {
  'Primal Kyogre': 'primal-kyogre',
  'Primal Groudon': 'primal-groudon',
};

/** The symbol a species' button for `kind` wears. */
export function powerupSymbol(pokemonId: number, kind: PowerupKind): PowerupSymbol {
  for (const form of formsFor(pokemonId, kind)) {
    const orb = PRIMAL_ORBS[form.label];
    if (orb) return orb;
  }
  return kind;
}

/** True when a species has any form under either powerup. */
export function hasAnyPowerup(pokemonId: number): boolean {
  return formsFor(pokemonId, 'mega').length > 0 || formsFor(pokemonId, 'dynamax').length > 0;
}

/**
 * The form a cell should draw, or null for the base Pokémon.
 *
 * Returns null whenever the powerup does not apply here — wrong row, wrong
 * seat, or a Pokémon that has no such form, which is what happens when the
 * seat's line is replaced under a powerup that was set for something else.
 */
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

/**
 * Pressing a powerup button.
 *
 * Cycles that Pokémon's forms and then returns to base, which is what makes
 * one button enough for Charizard's two Megas. Pressing the other powerup on
 * the same seat replaces it, because Mega and Gigantamax are mutually
 * exclusive on one Pokémon. Other seats are not touched: a team may power up
 * as many of its six as it likes.
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
