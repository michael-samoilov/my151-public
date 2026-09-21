import { describe, expect, it } from 'vitest';
import { SLOT_COUNT, slotKind, TEAM_SIZES, BOSS_ROW } from './constants';
import {
  GYM_LEADER_SLOTS,
  CARD_LINE_CAP,
  cardHasFullTeam,
  gymLeaderSlotsFilled,
  leagueNudgeEvent,
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
  it('treats gym-leader slots as the gym kind, not Elite Four', () => {
    const gyms = [...Array(SLOT_COUNT).keys()].filter((i) => slotKind(i) === 'gym').length;
    expect(GYM_LEADER_SLOTS).toBe(gyms);
    expect(GYM_LEADER_SLOTS).toBe(8);
  });

  it('treats a full trainer card as the boss-row team size', () => {
    expect(CARD_LINE_CAP).toBe(TEAM_SIZES[BOSS_ROW - 1]);
    expect(CARD_LINE_CAP).toBe(6);
  });

  it('does not treat five lines as a complete trainer card', () => {
    expect(cardHasFullTeam(card(5))).toBe(false);
    expect(reachedNudges(league([5]))).toEqual([]);
  });

  it('arms the card-export nudge when any card holds six lines', () => {
    expect(cardHasFullTeam(card(6))).toBe(true);
    expect(reachedNudges(league([6]))).toEqual(['card']);
    expect(reachedNudges(league([0, 0, 6]))).toEqual(['card']);
  });

  it('counts a gym-leader slot as filled once it holds a line', () => {
    expect(gymLeaderSlotsFilled(league([1, 1, 1, 1, 1, 1, 1, 0]))).toBe(7);
    expect(gymLeaderSlotsFilled(league([1, 1, 1, 1, 1, 1, 1, 1]))).toBe(8);
  });

  it('does not treat Elite Four seats as gym-leader members', () => {
    const elitePacked = league(Array(SLOT_COUNT).fill(0));
    for (let i = 8; i < SLOT_COUNT; i++) elitePacked[i] = card(6);
    expect(gymLeaderSlotsFilled(elitePacked)).toBe(0);
    expect(reachedNudges(elitePacked)).toEqual(['card']);
  });

  it('arms the league-export nudge when all eight gym-leader slots have a member', () => {
    expect(reachedNudges(league([1, 1, 1, 1, 1, 1, 1, 1]))).toEqual(['league']);
  });

  it('arms both when a full card and a full gym roster are present', () => {
    expect(reachedNudges(league([6, 1, 1, 1, 1, 1, 1, 1]))).toEqual(['card', 'league']);
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

  it('holds the league nudge until the user is on league home', () => {
    const cards = league([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(nextLeagueNudge({ ...idle, cards, openCard: 7 })).toBeNull();
    expect(nextLeagueNudge({ ...idle, cards, openCard: null })).toBe('league');
  });

  it('prefers the card nudge while a full card is open, even if the gym roster is also full', () => {
    const cards = league([6, 1, 1, 1, 1, 1, 1, 1]);
    expect(nextLeagueNudge({ ...idle, cards, openCard: 0 })).toBe('card');
    expect(nextLeagueNudge({ ...idle, cards, openCard: null, celebrated: ['card'] })).toBe('league');
  });

  it('does not replay a nudge already celebrated', () => {
    const cards = league([6, 1, 1, 1, 1, 1, 1, 1]);
    expect(nextLeagueNudge({ ...idle, cards, openCard: 0, celebrated: ['card', 'league'] })).toBeNull();
  });

  it('does not show a nudge over the export overlay', () => {
    const cards = league([6]);
    expect(nextLeagueNudge({ ...idle, cards, openCard: 0, exportOpen: true })).toBeNull();
  });
});

describe('leagueNudgeEvent', () => {
  it('names shown, cta, and dismiss so a dashboard can join by cid', () => {
    expect(leagueNudgeEvent('card', 'shown')).toBe('league-nudge-card-shown');
    expect(leagueNudgeEvent('card', 'cta')).toBe('league-nudge-card-cta');
    expect(leagueNudgeEvent('card', 'dismiss')).toBe('league-nudge-card-dismiss');
    expect(leagueNudgeEvent('league', 'shown')).toBe('league-nudge-league-shown');
    expect(leagueNudgeEvent('league', 'cta')).toBe('league-nudge-league-cta');
    expect(leagueNudgeEvent('league', 'dismiss')).toBe('league-nudge-league-dismiss');
  });
});
