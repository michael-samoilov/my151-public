import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LEAGUE_STORAGE_KEY, seedLeagueOnFirstVisit } from './seedLeague';
import type { TypeName } from '@/types/pokemon';
import { SLOT_COUNT, TEAM_SIZES, BOSS_ROW } from '../model/constants';
import { cyclePowerup, type Powerup, type PowerupKind } from '../model/powerups';
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
  tmMoveId: number | null;
  badgeName: string;
  legend: LegendPick | null;
  /**
   * The card's one Mega or Gigantamax, and the seat holding it.
   *
   * Optional because cards persisted before powerups existed have no field;
   * read it as `card.powerup ?? null`.
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
  /** Press a powerup button: cycle that seat's forms, or move the card's
   *  single powerup to it. */
  cyclePowerup: (card: number, seat: number, kind: PowerupKind, pokemonId: number) => void;
  moveSeat: (card: number, fromSeat: number, toSeat: number) => void;
  /** Set one stage's first row, pushing neighbouring boundaries (engine.setBoundary). */
  setStageBoundary: (card: number, seat: number, stage: number, row: number) => void;
  /** Restore a line's boundaries wholesale (a cancelled paint gesture). */
  setLineBoundaries: (card: number, seat: number, boundaries: number[]) => void;
  /** Mark a seat, and the member of its line the user actually picked. */
  /** Reset one card to an empty one. Every other card is untouched. */
  clearCard: (card: number) => void;
  setSignatureSeat: (card: number, seat: number | null, pokemonId?: number | null) => void;
  setTm: (card: number, moveId: number | null) => void;
  setBadgeName: (card: number, name: string) => void;
  setLegend: (card: number, legend: LegendPick | null) => void;
  moveSlot: (fromIndex: number, toIndex: number) => void;
}

export function emptyCard(): GymCard {
  return {
    type: null,
    theme: '',
    lines: [],
    signatureSeat: null,
    signatureId: null,
    tmMoveId: null,
    badgeName: '',
    legend: null,
    powerup: null,
  };
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
            // The same branch twice makes no sense; a tap on it removes instead.
            const key = branch.join('-');
            if (c.lines.some((l) => l.branch.join('-') === key)) return c;
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

      cyclePowerup: (card, seat, kind, pokemonId) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => ({
            ...c,
            powerup: cyclePowerup(c.powerup ?? null, seat, kind, pokemonId),
          })),
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
            // transfer to whatever replaces that line.
            const powerup = (c.powerup ?? null)?.seat === seat ? null : (c.powerup ?? null);
            return { ...c, lines, powerup };
          }),
        })),

      removeLineWith: (card, pokemonId) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const seat = c.lines.findIndex((l) => l.branch.includes(pokemonId)) + 1;
            if (seat === 0) return c;
            const lines = c.lines.filter((_, i) => i !== seat - 1);
            // The powerup belongs to the line, so it goes when the line goes
            // and follows the seats that close up behind it.
            const powerup = shiftPowerupAfterRemoval(c.powerup ?? null, seat);
            // The signature travels with its line (and dies with it) —
            // DECISIONS.md item 12.
            let signatureSeat = c.signatureSeat;
            let signatureId = c.signatureId ?? null;
            if (signatureSeat === seat) {
              signatureSeat = null;
              signatureId = null;
            } else if (signatureSeat !== null && signatureSeat > seat) signatureSeat -= 1;
            let legend = c.legend;
            if (legend && legend.seat > lines.length) legend = null;
            return { ...c, lines, signatureSeat, signatureId, legend, powerup };
          }),
        })),

      moveSeat: (card, fromSeat, toSeat) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            if (fromSeat === toSeat) return c;
            const lines = reorderSeats(c.lines, fromSeat, toSeat);
            // A column drag never changes which LINE carries the signature or
            // the powerup. Both name a seat, so both are re-aimed at the seat
            // their own line landed in.
            const signatureSeat = seatAfterMove(c.signatureSeat, fromSeat, toSeat);
            const powerupSeat = seatAfterMove(c.powerup?.seat ?? null, fromSeat, toSeat);
            const powerup =
              c.powerup && powerupSeat !== null ? { ...c.powerup, seat: powerupSeat } : (c.powerup ?? null);
            return { ...c, lines, signatureSeat, powerup };
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

      setTm: (card, moveId) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => ({ ...c, tmMoveId: moveId })),
        })),

      setBadgeName: (card, name) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => ({ ...c, badgeName: name })),
        })),

      setLegend: (card, legend) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => ({ ...c, legend })),
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
