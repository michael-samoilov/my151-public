import { describe, expect, it } from 'vitest';
import { describeLeague, summarizeLeague } from './leagueSummary';
import { defaultBoundaries } from './engine';
import type { GymCard } from '../store/useLeagueStore';

const card = (over: Partial<GymCard> = {}): GymCard => ({
  type: null, theme: '', lines: [], signatureSeat: null, tmMoveId: null, badgeName: '', ...over,
} as GymCard);
const line = { branch: [1, 2, 3], boundaries: [0, 16, 32] } as unknown as GymCard['lines'][number];

describe('summarizeLeague', () => {
  it('counts an empty league as nothing', () => {
    expect(summarizeLeague('', Array.from({ length: 11 }, () => card())))
      .toEqual({ cards: 0, seats: 0, typed: 0, named: 0, aces: 0, leagueNamed: false });
  });
  it('counts cards, seats, types, names and aces', () => {
    const cards = [
      card({ type: 'rock', lines: [line, line], signatureSeat: 0, badgeName: 'Boulder' }),
      card({ theme: 'Water', lines: [line] }),
      card({ type: 'none' }),
    ];
    expect(summarizeLeague('Kanto', cards))
      .toEqual({ cards: 2, seats: 3, typed: 2, named: 2, aces: 1, leagueNamed: true });
  });
});

describe('describeLeague', () => {
  const branch = [1, 2, 3];
  const placed = (over: Partial<{ branch: number[]; boundaries: number[] }> = {}) =>
    ({ branch, boundaries: defaultBoundaries(branch), ...over }) as GymCard['lines'][number];

  it('omits cards with no lines, so an untouched league is empty', () => {
    expect(describeLeague([card(), card()])).toEqual([]);
  });

  it('records which lines sit on which slot', () => {
    const out = describeLeague([card(), card({ lines: [placed()] })]);
    expect(out).toEqual([{ i: 1, l: [{ b: branch }] }]);
  });

  it('sends boundaries only when the user moved a stage', () => {
    const untouched = describeLeague([card({ lines: [placed()] })]);
    expect(untouched[0].l[0].bd).toBeUndefined();

    const moved = defaultBoundaries(branch).slice();
    moved[2] = (moved[2] ?? 1) + 3;
    const dragged = describeLeague([card({ lines: [placed({ boundaries: moved })] })]);
    expect(dragged[0].l[0].bd).toEqual(moved);
  });

  it('records the type, ace, partner and TM', () => {
    const out = describeLeague([
      card({ lines: [placed()], type: 'water', signatureSeat: 2, signatureId: 9, partnerId: 25, tmMoveId: 57 }),
    ]);
    expect(out[0]).toMatchObject({ t: 'water', ace: 2, aceId: 9, pa: 25, tm: 57 });
  });

  it('records legendaries as seat and species', () => {
    const out = describeLeague([
      card({ lines: [placed()], legends: [{ seat: 3, pokemonId: 144 }] }),
    ]);
    expect(out[0].lg).toEqual([[3, 144]]);
  });

  it('folds in a legacy single legendary', () => {
    const out = describeLeague([card({ lines: [placed()], legend: { seat: 1, pokemonId: 150 } })]);
    expect(out[0].lg).toEqual([[1, 150]]);
  });
});
