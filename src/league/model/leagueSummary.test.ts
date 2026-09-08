import { describe, expect, it } from 'vitest';
import { summarizeLeague } from './leagueSummary';
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
