import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LEAGUE_PERSIST_VERSION, LEAGUE_STORAGE_KEY, seedLeagueOnFirstVisit } from './seedLeague';
import type { TypeName } from '@/types/pokemon';
import { SLOT_COUNT, TEAM_SIZES, BOSS_ROW, ROW_COUNT } from '../model/constants';
import { legendsOf } from '../model/cardPicks';
export { legendsOf } from '../model/cardPicks';
import {
  allCardsFilled,
  allCardsHaveFullTeams,
  parseCelebratedNudges,
  reachedNudges,
  type LeagueNudgeId,
} from '../model/funnelNudges';
import {
  POWERUP_ROWS,
  cyclePowerup,
  type CardPowerups,
  type Powerup,
  type PowerupKind,
} from '../model/powerups';
import {
  defaultBoundaries,
  leagueSlotIsEmpty,
  levelBoundaries,
  makePlacedLine,
  moveLeagueSlots,
  moveSeat as reorderSeats,
  setBoundary,
  type LegendPick,
  type PlacedLine,
} from '../model/engine';

export type CardType = TypeName | 'none' | null;

export interface GymCard {
  type: CardType;
  theme: string;
  lines: PlacedLine[];
  signatureSeat: number | null;
  signatureId?: number | null;
  partnerId?: number | null;
  tmMoveId: number | null;
  badgeName: string;
  legend?: LegendPick | null;
  legends?: LegendPick[];
  powerups?: CardPowerups;
  powerup?: Powerup | null;
}

export type LeagueView = 'challenge' | 'rematch';

interface LeagueState {
  name: string;
  cards: GymCard[];
  view: LeagueView;
  celebratedNudges: LeagueNudgeId[];
  fullLeagueCelebrated: boolean;

  setName: (name: string) => void;
  setView: (view: LeagueView) => void;
  setCardType: (card: number, type: CardType) => void;
  setCardTheme: (card: number, theme: string) => void;
  placeBranch: (card: number, branch: number[], at?: 'end' | 'front') => void;
  removeLineAt: (card: number, seat: number) => void;
  removeLineWith: (card: number, pokemonId: number) => void;
  replaceLine: (card: number, seat: number, branch: number[]) => void;
  cyclePowerup: (card: number, row: number, seat: number, kind: PowerupKind, pokemonId: number) => void;
  moveSeat: (card: number, fromSeat: number, toSeat: number) => void;
  setStageBoundary: (card: number, seat: number, stage: number, row: number) => void;
  setLineBoundaries: (card: number, seat: number, boundaries: number[]) => void;
  clearCard: (card: number) => void;
  setSignatureSeat: (card: number, seat: number | null, pokemonId?: number | null) => void;
  setPartner: (card: number, pokemonId: number | null) => void;
  setTm: (card: number, moveId: number | null) => void;
  setBadgeName: (card: number, name: string) => void;
  setLegend: (card: number, legend: LegendPick | null, seat?: number) => void;
  moveLegend: (card: number, fromSeat: number, toSeat: number) => void;
  moveSlot: (fromIndex: number, toIndex: number) => void;
  markNudgeCelebrated: (id: LeagueNudgeId) => void;
  markFullLeagueCelebrated: () => void;
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

export function legendAt(card: GymCard, seat: number): LegendPick | null {
  return legendsOf(card).find((l) => l.seat === seat) ?? null;
}

export function powerupsAt(card: GymCard, row: number): Powerup[] {
  const stored = card.powerups?.[row];
  if (Array.isArray(stored)) return stored;
  if (stored) return [stored as Powerup];
  if (card.powerups) return [];
  return card.powerup ? [card.powerup] : [];
}

export function powerupAt(card: GymCard, row: number, seat?: number): Powerup | null {
  const all = powerupsAt(card, row);
  if (seat === undefined) return all[0] ?? null;
  return all.find((p) => p.seat === seat) ?? null;
}

function powerupMap(card: GymCard): CardPowerups {
  return Object.fromEntries(POWERUP_ROWS.map((row) => [row, powerupsAt(card, row)]));
}

function withPowerups(card: GymCard, fn: (p: Powerup, row: number) => Powerup | null): GymCard {
  const powerups = Object.fromEntries(
    POWERUP_ROWS.map((row) => [
      row,
      powerupsAt(card, row).map((p) => fn(p, row)).filter((p): p is Powerup => p !== null),
    ]),
  );
  return { ...card, powerups, powerup: null };
}

/** A legendary replaces its line on the boss row, so the powerup there is its own. */
function legendCell(card: GymCard, row: number, seat: number): boolean {
  return row === BOSS_ROW && legendAt(card, seat) !== null;
}

const MAX_SEATS = TEAM_SIZES[BOSS_ROW - 1];

export function seatAfterMove(seat: number | null, fromSeat: number, toSeat: number): number | null {
  if (seat === null) return null;
  if (seat === fromSeat) return toSeat;
  let next = seat;
  if (next > fromSeat) next -= 1;
  if (next >= toSeat) next += 1;
  return next;
}

function shiftPowerupAfterRemoval(powerup: Powerup | null, seat: number): Powerup | null {
  if (!powerup) return null;
  if (powerup.seat === seat) return null;
  return powerup.seat > seat ? { ...powerup, seat: powerup.seat - 1 } : powerup;
}

function withCard(
  cards: GymCard[],
  index: number,
  fn: (card: GymCard) => GymCard,
): GymCard[] {
  return cards.map((c, i) => (i === index ? fn(c) : c));
}

function sameBoundaries(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

type PersistedLeagueState = {
  name?: string;
  cards?: GymCard[];
  view?: LeagueView;
  celebratedNudges?: unknown;
  fullLeagueCelebrated?: unknown;
};

export function migrateLeagueState(persisted: unknown, version: number): PersistedLeagueState {
  const state = (persisted ?? {}) as PersistedLeagueState;
  const legacyCards = version < 3 && state.cards
    ? state.cards.map((card) => ({
        ...card,
        lines: card.lines.map((line) => {
          const automatic = line.boundaryMode === 'auto'
            || (line.boundaryMode === undefined
              && sameBoundaries(line.boundaries, levelBoundaries(line.branch)));
          return {
            ...line,
            boundaries: automatic ? defaultBoundaries(line.branch) : [...line.boundaries],
            boundaryMode: automatic ? 'auto' as const : 'manual' as const,
          };
        }),
      }))
    : state.cards;
  const cards = version < 6 && legacyCards
    ? legacyCards.map((card) => ({
        ...card,
        lines: card.lines.map((line) => {
          if (line.boundaryMode !== 'auto') return line;
          if (version >= 3 && line.boundaries.some((row) => row > ROW_COUNT)) {
            return { ...line, boundaryMode: 'manual' as const };
          }
          return { ...line, boundaries: defaultBoundaries(line.branch) };
        }),
      }))
    : legacyCards;
  const celebrated = version < 2 || state.celebratedNudges === undefined
    ? reachedNudges(cards ?? [])
    : parseCelebratedNudges(state.celebratedNudges);
  const celebratedNudges = version < 4
    && celebrated.includes('league')
    && !celebrated.includes('complete')
    && allCardsFilled(cards ?? [])
    ? [...celebrated, 'complete' as const]
    : celebrated;
  const fullLeagueCelebrated = version < 7 || state.fullLeagueCelebrated === undefined
    ? allCardsHaveFullTeams(cards ?? [])
    : state.fullLeagueCelebrated === true;

  return { ...state, cards, celebratedNudges, fullLeagueCelebrated };
}

seedLeagueOnFirstVisit();

function withoutSeat(c: GymCard, seat: number): GymCard {
  if (seat < 1 || seat > c.lines.length) return c;
  const lines = c.lines.filter((_, i) => i !== seat - 1);
  // A form on a seat with no line left would dress the next line placed there.
  const { powerups } = withPowerups(c, (p) => {
    const next = shiftPowerupAfterRemoval(p, seat);
    return next && next.seat <= lines.length ? next : null;
  });
  let signatureSeat = c.signatureSeat;
  let signatureId = c.signatureId ?? null;
  if (signatureSeat === seat) {
    signatureSeat = null;
    signatureId = null;
  } else if (signatureSeat !== null && signatureSeat > seat) signatureSeat -= 1;
  const legends = legendsOf(c)
    .filter((l) => l.seat !== seat)
    .map((l) => ({ ...l, seat: l.seat > seat ? l.seat - 1 : l.seat }))
    .filter((l) => l.seat <= lines.length);
  return {
    ...c, lines, signatureSeat, signatureId,
    legends, legend: null, powerups, powerup: null,
  };
}

export const useLeagueStore = create<LeagueState>()(
  persist(
    (set) => ({
      name: '',
      cards: Array.from({ length: SLOT_COUNT }, emptyCard),
      view: 'challenge',
      celebratedNudges: [],
      fullLeagueCelebrated: false,

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
            const current = powerupAt(c, row, seat);
            const next = cyclePowerup(current, seat, kind, pokemonId);
            const withSeat = (list: Powerup[]) => {
              const rest = list.filter((p) => p.seat !== seat);
              return next ? [...rest, next] : rest;
            };
            const same = (p: Powerup | null) =>
              p === null ? current === null : current !== null && p.kind === current.kind && p.index === current.index;
            const rows = POWERUP_ROWS.filter(
              (r) => r === row || (r > row && !legendCell(c, r, seat) && same(powerupAt(c, r, seat))),
            );
            const powerups = {
              ...powerupMap(c),
              ...Object.fromEntries(rows.map((r) => [r, withSeat(powerupsAt(c, r))])),
            };
            return { ...c, powerups, powerup: null };
          }),
        })),

      replaceLine: (card, seat, branch) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            if (seat < 1 || seat > c.lines.length) return c;
            const lines = c.lines.map((line, i) => (i === seat - 1 ? makePlacedLine(branch) : line));
            return {
              ...withPowerups(c, (p, row) => (p.seat === seat && !legendCell(c, row, seat) ? null : p)),
              lines,
            };
          }),
        })),

      removeLineWith: (card, pokemonId) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const seat = c.lines.findIndex((l) => l.branch.includes(pokemonId)) + 1;
            return seat > 0 ? withoutSeat(c, seat) : c;
          }),
        })),

      removeLineAt: (card, seat) =>
        set((s) => ({ cards: withCard(s.cards, card, (c) => withoutSeat(c, seat)) })),

      moveSeat: (card, fromSeat, toSeat) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            if (fromSeat === toSeat) return c;
            const lines = reorderSeats(c.lines, fromSeat, toSeat);
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
              i === seat - 1 ? { ...l, boundaries, boundaryMode: 'manual' as const } : l,
            );
            return { ...c, lines };
          }),
        })),

      setLineBoundaries: (card, seat, boundaries) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            const line = c.lines[seat - 1];
            if (!line || boundaries.length !== line.branch.length) return c;
            const boundaryMode = sameBoundaries(boundaries, defaultBoundaries(line.branch))
              ? 'auto' as const
              : 'manual' as const;
            const lines = c.lines.map((l, i) =>
              i === seat - 1 ? { ...l, boundaries: [...boundaries], boundaryMode } : l,
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
            // The form on the boss row belonged to the Pokémon that leaves it.
            const { powerups } = withPowerups(c, (p, row) => (row === BOSS_ROW && p.seat === target ? null : p));
            return { ...c, legends: legend ? [...rest, legend] : rest, legend: null, powerups, powerup: null };
          }),
        })),

      moveLegend: (card, fromSeat, toSeat) =>
        set((s) => ({
          cards: withCard(s.cards, card, (c) => {
            // A legendary replaces a line's boss-row Pokémon, so a column with
            // no line has nothing for it to replace.
            if (fromSeat === toSeat || !legendAt(c, fromSeat) || toSeat > c.lines.length) return c;
            const traded = legendAt(c, toSeat) !== null;
            // Onto a seat without a legendary it moves; onto one with a
            // legendary the two trade places. Each takes its form along, and
            // the line it now covers loses its own boss-row form.
            const legends = legendsOf(c).map((l) =>
              l.seat === fromSeat ? { ...l, seat: toSeat }
              : l.seat === toSeat ? { ...l, seat: fromSeat }
              : l,
            );
            const { powerups } = withPowerups(c, (p, row) => {
              if (row !== BOSS_ROW) return p;
              if (p.seat === fromSeat) return { ...p, seat: toSeat };
              if (p.seat === toSeat) return traded ? { ...p, seat: fromSeat } : null;
              return p;
            });
            return { ...c, legends, legend: null, powerups, powerup: null };
          }),
        })),

      moveSlot: (fromIndex, toIndex) =>
        set((s) => ({
          cards: moveLeagueSlots(
            s.cards,
            fromIndex,
            toIndex,
            leagueSlotIsEmpty,
            emptyCard,
          ),
        })),

      markNudgeCelebrated: (id) =>
        set((s) =>
          s.celebratedNudges.includes(id) ? {} : { celebratedNudges: [...s.celebratedNudges, id] },
        ),

      markFullLeagueCelebrated: () => set({ fullLeagueCelebrated: true }),
    }),
    {
      name: LEAGUE_STORAGE_KEY,
      version: LEAGUE_PERSIST_VERSION,
      migrate: migrateLeagueState,
    },
  ),
);
