import { describe, expect, it } from 'vitest';
import { SLOT_COUNT } from './constants';
import {
  cardHasFullTeam,
  gymLeaderSlotsFilled,
  nextLeagueNudge,
  reachedNudges,
} from './funnelNudges';

function card(n: number) {
  return { lines: Array.from({ length: n }, (_, i) => ({ branch: [i + 1], boundaries: [1] })) };
}

function league(counts: number[]) {
  const cards = Array.from({ length: SLOT_COUNT }, () => card(0));
  counts.forEach((n, i) => {
    cards[i] = card(n);
  });
  return cards;
}

describe('league funnel nudge thresholds', () => {
  it('does not treat five lines as a complete trainer card', () => {
    expect(cardHasFullTeam(card(5))).toBe(false);
    expect(reachedNudges(league([5]))).toEqual([]);
  });

  it('does not treat Elite Four seats as gym-leader members', () => {
    const elitePacked = league(Array(SLOT_COUNT).fill(0));
    for (let i = 8; i < SLOT_COUNT; i++) elitePacked[i] = card(6);
    expect(gymLeaderSlotsFilled(elitePacked)).toBe(0);
    expect(reachedNudges(elitePacked)).toEqual(['card']);
  });
});

describe('nextLeagueNudge', () => {
  const idle = {
    celebrated: [] as const,
    browserOpen: false,
    exportOpen: false,
  };

  it('holds the card nudge until the full card is on screen and the picker is closed', () => {
    const cards = league([6]);
    expect(nextLeagueNudge({ ...idle, cards, openCard: 0, browserOpen: true })).toBeNull();
    expect(nextLeagueNudge({ ...idle, cards, openCard: null })).toBeNull();
    expect(nextLeagueNudge({ ...idle, cards, openCard: 0 })).toBe('card');
  });
});
