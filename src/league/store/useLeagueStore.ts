import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TypeName } from '@/types/pokemon';
import { SLOT_COUNT, TEAM_SIZES, BOSS_ROW } from '../model/constants';
import {
  makePlacedLine,
  moveSeat as reorderSeats,
  shiftBoundary as clampShift,
  type LegendPick,
  type PlacedLine,
} from '../model/engine';

/**
 * One league, stored as intent only: which branches sit in which seats, the
 * card identity fields, and where the user dragged things. Displayed teams
 * are always derived (src/league/model/engine.ts) — nothing derived is
 * persisted, so the derivation rules can evolve without a migration.
 */

export interface GymCard {
  type: TypeName | null;
  theme: string;
  /** Index 0 = seat 1 = the rightmost, always-present column. Max 6. */
  lines: PlacedLine[];
  /** Seat carrying the signature mark, or null. */
  signatureSeat: number | null;
  tmMoveId: number | null;
  badgeName: string;
  legend: LegendPick | null;
}

export interface LeagueState {
  name: string;
  /** Exactly 14, in league order; the index decides the slot kind. */
  cards: GymCard[];

  setName: (name: string) => void;
  setCardType: (card: number, type: TypeName | null) => void;
  setCardTheme: (card: number, theme: string) => void;
  /** Seat a branch. 'front' = seat 1 (signature insertion), 'end' = next free. */
  placeBranch: (card: number, branch: number[], at?: 'end' | 'front') => void;
  /** Remove whichever line contains the id; later seats close up. */
  removeLineWith: (card: number, pokemonId: number) => void;
  moveSeat: (card: number, fromSeat: number, toSeat: number) => void;
  shiftBoundary: (card: number, seat: number, stage: number, row: number) => void;
  setSignatureSeat: (card: number, seat: number | null) => void;
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
    tmMoveId: null,
    badgeName: '',
    legend: null,
  };
}

const MAX_SEATS = TEAM_SIZES[BOSS_ROW - 1];

/** Immutably update one card. */
function withCard(
  cards: GymCard[],
  index: number,
  fn: (card: GymCard) => GymCard,
): GymCard[] {
  return cards.map((c, i) => (i === index ? fn(c) : c));
}

export const useLeagueStore = create<LeagueState>()(
  persist(
    (set) => ({
      name: '',
      cards: Array.from({ length: SLOT_COUNT }, emptyCard),

      setName: (name) => set({ name }),

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

      removeLineWith: (card, pokemonId) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const seat = c.lines.findIndex((l) => l.branch.includes(pokemonId)) + 1;
            if (seat === 0) return c;
            const lines = c.lines.filter((_, i) => i !== seat - 1);
            // The signature travels with its line (and dies with it) —
            // DECISIONS.md item 12.
            let signatureSeat = c.signatureSeat;
            if (signatureSeat === seat) signatureSeat = null;
            else if (signatureSeat !== null && signatureSeat > seat) signatureSeat -= 1;
            let legend = c.legend;
            if (legend && legend.seat > lines.length) legend = null;
            return { ...c, lines, signatureSeat, legend };
          }),
        })),

      moveSeat: (card, fromSeat, toSeat) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            if (fromSeat === toSeat) return c;
            const lines = reorderSeats(c.lines, fromSeat, toSeat);
            // Column drag never changes which LINE is the signature.
            let signatureSeat = c.signatureSeat;
            if (signatureSeat !== null) {
              if (signatureSeat === fromSeat) signatureSeat = toSeat;
              else {
                if (signatureSeat > fromSeat) signatureSeat -= 1;
                if (signatureSeat >= toSeat) signatureSeat += 1;
              }
            }
            return { ...c, lines, signatureSeat };
          }),
        })),

      shiftBoundary: (card, seat, stage, row) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const line = c.lines[seat - 1];
            if (!line) return c;
            const boundaries = clampShift(line, stage, row);
            const lines = c.lines.map((l, i) =>
              i === seat - 1 ? { ...l, boundaries } : l,
            );
            return { ...c, lines };
          }),
        })),

      setSignatureSeat: (card, seat) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => ({ ...c, signatureSeat: seat })),
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
      name: 'league-builder',
      version: 1,
    },
  ),
);
