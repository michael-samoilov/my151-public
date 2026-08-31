import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LEAGUE_STORAGE_KEY, seedLeagueOnFirstVisit } from './seedLeague';
import type { TypeName } from '@/types/pokemon';
import { SLOT_COUNT, TEAM_SIZES, BOSS_ROW } from '../model/constants';
import {
  POWERUP_ROWS,
  cyclePowerup,
  type CardPowerups,
  type Powerup,
  type PowerupKind,
} from '../model/powerups';
import {
  makePlacedLine,
  moveSeat as reorderSeats,
  setBoundary,
  type LegendPick,
  type PlacedLine,
} from '../model/engine';

/**
 * One league, stored as intent only: which branches sit in which seats, the
 * card identity fields, and where the user dragged things. Displayed teams
 * are always derived (src/league/model/engine.ts) — nothing derived is
 * persisted, so the derivation rules can evolve without a migration.
 */

/** The card's chosen type: a real type, an explicit "no type", or unset. */
export type CardType = TypeName | 'none' | null;

export interface GymCard {
  type: CardType;
  theme: string;
  /** Index 0 = seat 1 = the rightmost, always-present column. Max 6. */
  lines: PlacedLine[];
  /** Seat carrying the signature mark, or null. */
  signatureSeat: number | null;
  /**
   * The member of that seat's line the user picked, or null for "whatever the
   * boss row fields".
   *
   * The picker offers one tile per Pokemon, so the pick is a Pokemon and not a
   * line, and a line's leaf is rarely the one a leader is famous for. Optional
   * because cards persisted before the field existed have none; a card that
   * no longer holds the id falls back, so nothing has to migrate.
   */
  signatureId?: number | null;
  /**
   * The partner Pokemon sharing the ace's slot, or null.
   *
   * A plain id rather than a seat, because the partner is the leader's
   * companion and not their sixth Pokemon: it does not have to be on the
   * team. It is still *seated* when the card has room — choosing one on a
   * five-line card fills the sixth line as well — but a full card keeps it in
   * the slot alone. Optional, so cards saved before the field existed read as
   * having no partner without a migration.
   */
  partnerId?: number | null;
  tmMoveId: number | null;
  badgeName: string;
  /**
   * The single legendary, from before a row could hold more than one.
   *
   * Kept for cards already on disk. Nothing writes it any more; read the row
   * through `legendsOf`, which folds it in.
   */
  legend?: LegendPick | null;
  /** Every legendary swapped into the endgame row, at most one per seat. */
  legends?: LegendPick[];
  /**
   * One Mega or Gigantamax per powerup row, by row.
   *
   * The champion and endgame boss rows are the same six Pokemon at different
   * strengths, so the first press sets both — and every press after that sets
   * only the row it was pressed on, because a leader who Megas one Pokemon as
   * champion and another at full strength is a real card.
   *
   * Read it through `powerupAt`, never directly: a card saved before the two
   * rows could differ carries `powerup` instead, and `powerupAt` reads that
   * on both rows, which is exactly what it meant.
   */
  powerups?: CardPowerups;
  /**
   * The single shared powerup, from before the rows could differ.
   *
   * Kept for cards already on disk. Nothing writes it any more; the first
   * press on such a card replaces it with `powerups`.
   */
  powerup?: Powerup | null;
}

/**
 * Which team the league home draws for each trainer.
 *
 * `challenge` is the run through the league: gym 1 shows a two-Pokemon team,
 * the champion shows six. `rematch` shows every trainer's endgame boss team,
 * which is the same card read at its last row — the HeartGold/SoulSilver gym
 * rematch, for the whole league at once.
 */
export type LeagueView = 'challenge' | 'rematch';

export interface LeagueState {
  name: string;
  /** Exactly 14, in league order; the index decides the slot kind. */
  cards: GymCard[];
  /** Which row of each card the league home draws. Not part of a card. */
  view: LeagueView;

  setName: (name: string) => void;
  setView: (view: LeagueView) => void;
  setCardType: (card: number, type: CardType) => void;
  setCardTheme: (card: number, theme: string) => void;
  /** Seat a branch. 'front' = seat 1 (signature insertion), 'end' = next free. */
  placeBranch: (card: number, branch: number[], at?: 'end' | 'front') => void;
  /** Remove whichever line contains the id; later seats close up. */
  removeLineWith: (card: number, pokemonId: number) => void;
  /** Swap the line at a seat for another, keeping the seat's place. */
  replaceLine: (card: number, seat: number, branch: number[]) => void;
  /** Press a powerup button on one row: cycle that seat's forms, or move
   *  that row's powerup to it. The first press on a card sets every row. */
  cyclePowerup: (card: number, row: number, seat: number, kind: PowerupKind, pokemonId: number) => void;
  moveSeat: (card: number, fromSeat: number, toSeat: number) => void;
  /** Set one stage's first row, pushing neighbouring boundaries (engine.setBoundary). */
  setStageBoundary: (card: number, seat: number, stage: number, row: number) => void;
  /** Restore a line's boundaries wholesale (a cancelled paint gesture). */
  setLineBoundaries: (card: number, seat: number, boundaries: number[]) => void;
  /** Mark a seat, and the member of its line the user actually picked. */
  /** Reset one card to an empty one. Every other card is untouched. */
  clearCard: (card: number) => void;
  setSignatureSeat: (card: number, seat: number | null, pokemonId?: number | null) => void;
  /** Set or clear the partner sharing the ace's slot. */
  setPartner: (card: number, pokemonId: number | null) => void;
  setTm: (card: number, moveId: number | null) => void;
  setBadgeName: (card: number, name: string) => void;
  /** Put a legendary on a seat. Passing null clears that seat's. */
  setLegend: (card: number, legend: LegendPick | null, seat?: number) => void;
  /** Trade two seats' legendaries, which is what a drop onto an occupied seat does. */
  swapLegends: (card: number, fromSeat: number, toSeat: number) => void;
  moveSlot: (fromIndex: number, toIndex: number) => void;
}

export function emptyCard(): GymCard {
  return {
    type: null,
    theme: '',
    lines: [],
    signatureSeat: null,
    signatureId: null,
    partnerId: null,
    tmMoveId: null,
    badgeName: '',
    legend: null,
    legends: [],
    powerups: {},
    powerup: null,
  };
}

/**
 * The powerup a row is wearing.
 *
 * The only way to read one. A card saved before the rows could differ has no
 * `powerups` map and one `powerup` instead, which applied to both rows — so
 * that is what it answers with, and the card keeps drawing what it drew.
 */
/**
 * Every legendary on a card's endgame row.
 *
 * A card saved before the row could hold more than one carries a single
 * `legend`, which reads as a one-entry list — exactly what it meant.
 */
export function legendsOf(card: GymCard): LegendPick[] {
  if (card.legends) return card.legends;
  return card.legend ? [card.legend] : [];
}

/** The legendary on one seat of the endgame row, or null. */
export function legendAt(card: GymCard, seat: number): LegendPick | null {
  return legendsOf(card).find((l) => l.seat === seat) ?? null;
}

export function powerupsAt(card: GymCard, row: number): Powerup[] {
  const stored = card.powerups?.[row];
  // A card saved before a row could hold more than one carries a single
  // `Powerup` here, and one saved before the rows could differ carries the
  // card-wide `powerup` instead. Both read as a one-entry row, which is
  // exactly what they meant.
  if (Array.isArray(stored)) return stored;
  if (stored) return [stored as Powerup];
  if (card.powerups) return [];
  return card.powerup ? [card.powerup] : [];
}

/** The powerup on one seat of one row, or null. */
export function powerupAt(card: GymCard, row: number, seat?: number): Powerup | null {
  const all = powerupsAt(card, row);
  if (seat === undefined) return all[0] ?? null;
  return all.find((p) => p.seat === seat) ?? null;
}

/** Every row's powerup, as a map, whichever shape the card is stored in. */
function powerupMap(card: GymCard): CardPowerups {
  return Object.fromEntries(POWERUP_ROWS.map((row) => [row, powerupsAt(card, row)]));
}

/** Rewrite every powerup on every row, dropping the pre-split field as it goes. */
function withPowerups(card: GymCard, fn: (p: Powerup) => Powerup | null): GymCard {
  const powerups = Object.fromEntries(
    POWERUP_ROWS.map((row) => [
      row,
      powerupsAt(card, row).map(fn).filter((p): p is Powerup => p !== null),
    ]),
  );
  return { ...card, powerups, powerup: null };
}

const MAX_SEATS = TEAM_SIZES[BOSS_ROW - 1];

/**
 * Where a seat number lands after a column moves from one seat to another.
 *
 * Anything that names a seat — the signature mark, the card's powerup —
 * names a line through it, so it has to follow that line rather than stay on
 * the number. The dragged seat becomes the target; every other seat shifts by
 * the one that left and the one that arrived.
 */
function seatAfterMove(seat: number | null, fromSeat: number, toSeat: number): number | null {
  if (seat === null) return null;
  if (seat === fromSeat) return toSeat;
  let next = seat;
  if (next > fromSeat) next -= 1;
  if (next >= toSeat) next += 1;
  return next;
}

/** The card's powerup after the line at `seat` is removed: gone, or shifted. */
function shiftPowerupAfterRemoval(powerup: Powerup | null, seat: number): Powerup | null {
  if (!powerup) return null;
  if (powerup.seat === seat) return null;
  return powerup.seat > seat ? { ...powerup, seat: powerup.seat - 1 } : powerup;
}

/** Immutably update one card. */
function withCard(
  cards: GymCard[],
  index: number,
  fn: (card: GymCard) => GymCard,
): GymCard[] {
  return cards.map((c, i) => (i === index ? fn(c) : c));
}

// Writes a seeded league on a preview build's first visit, before `persist`
// reads the key. No-op on production and on every later visit.
seedLeagueOnFirstVisit();

export const useLeagueStore = create<LeagueState>()(
  persist(
    (set) => ({
      name: '',
      cards: Array.from({ length: SLOT_COUNT }, emptyCard),
      view: 'challenge',

      setName: (name) => set({ name }),

      setView: (view) => set({ view }),

      setCardType: (card, type) =>
        set((s) => ({ cards: withCard(s.cards, card, (c) => ({ ...c, type })) })),

      setCardTheme: (card, theme) =>
        set((s) => ({ cards: withCard(s.cards, card, (c) => ({ ...c, theme })) })),

      placeBranch: (card, branch, at = 'end') =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            if (branch.length === 0 || c.lines.length >= MAX_SEATS) return c;
            // The same line twice is allowed: a gym can field two Geodudes,
            // and a team of six of the same Pokemon is a card a person can
            // build. A line comes off by its own red ✗, so the picker never
            // has to double as the remove control.
            const line = makePlacedLine(branch);
            const lines =
              at === 'front' ? [line, ...c.lines] : [...c.lines, line];
            const signatureSeat =
              at === 'front' && c.signatureSeat !== null
                ? c.signatureSeat + 1
                : c.signatureSeat;
            return { ...c, lines, signatureSeat };
          }),
        })),

      cyclePowerup: (card, row, seat, kind, pokemonId) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const next = cyclePowerup(powerupAt(c, row, seat), seat, kind, pokemonId);
            /** This seat's entry replaced, added or dropped; the rest kept. */
            const withSeat = (list: Powerup[]) => {
              const rest = list.filter((p) => p.seat !== seat);
              return next ? [...rest, next] : rest;
            };
            // The first press on a card sets this seat on every powerup row:
            // a leader's Elite Four, champion and endgame teams are the same
            // six Pokemon, so pressing Mega once and finding it on only one
            // of them reads as the press not having worked. Every press after
            // that sets only its own row, which is what lets the three differ.
            const bare = POWERUP_ROWS.every((r) => powerupsAt(c, r).length === 0);
            const powerups = bare
              ? Object.fromEntries(POWERUP_ROWS.map((r) => [r, next ? [next] : []]))
              : { ...powerupMap(c), [row]: withSeat(powerupsAt(c, row)) };
            return { ...c, powerups, powerup: null };
          }),
        })),

      replaceLine: (card, seat, branch) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            if (seat < 1 || seat > c.lines.length) return c;
            // The seat keeps everything that belongs to the seat rather than
            // to the line: its place in the team, and the signature mark if
            // it carried one. The evolution rows are the line's own, so the
            // new line arrives with its own defaults.
            const lines = c.lines.map((line, i) => (i === seat - 1 ? makePlacedLine(branch) : line));
            // A powerup is a form of the line that held it, so it does not
            // transfer to whatever replaces that line — on either row.
            return { ...withPowerups(c, (p) => (p.seat === seat ? null : p)), lines };
          }),
        })),

      removeLineWith: (card, pokemonId) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const seat = c.lines.findIndex((l) => l.branch.includes(pokemonId)) + 1;
            if (seat === 0) return c;
            const lines = c.lines.filter((_, i) => i !== seat - 1);
            // The powerup belongs to the line, so it goes when the line goes
            // and follows the seats that close up behind it, on every row.
            const { powerups } = withPowerups(c, (p) => shiftPowerupAfterRemoval(p, seat));
            // The signature travels with its line (and dies with it) —
            // DECISIONS.md item 12.
            let signatureSeat = c.signatureSeat;
            let signatureId = c.signatureId ?? null;
            if (signatureSeat === seat) {
              signatureSeat = null;
              signatureId = null;
            } else if (signatureSeat !== null && signatureSeat > seat) signatureSeat -= 1;
            // A legendary sits over a column, so it follows the seats closing
            // up behind the removed one, and goes with the column it was on.
            const legends = legendsOf(c)
              .filter((l) => l.seat !== seat)
              .map((l) => ({ ...l, seat: l.seat > seat ? l.seat - 1 : l.seat }))
              .filter((l) => l.seat <= lines.length);
            return {
              ...c, lines, signatureSeat, signatureId,
              legends, legend: null, powerups, powerup: null,
            };
          }),
        })),

      moveSeat: (card, fromSeat, toSeat) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            if (fromSeat === toSeat) return c;
            const lines = reorderSeats(c.lines, fromSeat, toSeat);
            // A column drag never changes which LINE carries the signature,
            // the powerup or the legendary swapped over it. All three name a
            // seat, so all three are re-aimed at the seat their own line
            // landed in — a legendary belongs to the column a person put it
            // on, not to the position that column happened to be in.
            const signatureSeat = seatAfterMove(c.signatureSeat, fromSeat, toSeat);
            const { powerups } = withPowerups(c, (p) => ({
              ...p,
              seat: seatAfterMove(p.seat, fromSeat, toSeat) ?? p.seat,
            }));
            const legends = legendsOf(c).map((l) => ({
              ...l,
              seat: seatAfterMove(l.seat, fromSeat, toSeat) ?? l.seat,
            }));
            return { ...c, lines, signatureSeat, powerups, powerup: null, legends, legend: null };
          }),
        })),

      setStageBoundary: (card, seat, stage, row) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const line = c.lines[seat - 1];
            if (!line) return c;
            const boundaries = setBoundary(line, stage, row);
            const lines = c.lines.map((l, i) =>
              i === seat - 1 ? { ...l, boundaries } : l,
            );
            return { ...c, lines };
          }),
        })),

      setLineBoundaries: (card, seat, boundaries) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const line = c.lines[seat - 1];
            if (!line || boundaries.length !== line.branch.length) return c;
            const lines = c.lines.map((l, i) =>
              i === seat - 1 ? { ...l, boundaries: [...boundaries] } : l,
            );
            return { ...c, lines };
          }),
        })),

      clearCard: (card) =>
        set((s) => ({ cards: withCard(s.cards, card, () => emptyCard()) })),

      setSignatureSeat: (card, seat, pokemonId = null) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => ({
            ...c,
            signatureSeat: seat,
            signatureId: seat === null ? null : pokemonId,
          })),
        })),

      setPartner: (card, pokemonId) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => ({ ...c, partnerId: pokemonId })),
        })),

      setTm: (card, moveId) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => ({ ...c, tmMoveId: moveId })),
        })),

      setBadgeName: (card, name) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => ({ ...c, badgeName: name })),
        })),

      setLegend: (card, legend, seat) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const target = legend?.seat ?? seat;
            if (target === undefined) return c;
            const rest = legendsOf(c).filter((l) => l.seat !== target);
            return { ...c, legends: legend ? [...rest, legend] : rest, legend: null };
          }),
        })),

      swapLegends: (card, fromSeat, toSeat) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            // Dropping a legendary on a seat that already holds one trades
            // them, rather than one of the two vanishing. Both seats keep a
            // legendary, which is the only reading of the gesture that loses
            // nothing.
            const legends = legendsOf(c).map((l) =>
              l.seat === fromSeat ? { ...l, seat: toSeat }
              : l.seat === toSeat ? { ...l, seat: fromSeat }
              : l,
            );
            return { ...c, legends, legend: null };
          }),
        })),

      moveSlot: (fromIndex, toIndex) =>
        set((s) => {
          const cards = [...s.cards];
          const [moved] = cards.splice(fromIndex, 1);
          if (moved === undefined) return s;
          cards.splice(toIndex, 0, moved);
          return { cards };
        }),
    }),
    {
      name: LEAGUE_STORAGE_KEY,
      version: 1,
    },
  ),
);
