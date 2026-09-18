import { describe, expect, it } from 'vitest';
import {
  leagueBoardAtPlayhead,
  leagueOccupancyAtPlayhead,
  occupancyPresent,
} from './leaguePlayhead';

const gym = (i: number, ids: number[]) => ({ i, l: [{ b: ids }] });
const latest = [gym(0, [1, 4, 7]), gym(1, [25])];
const early = [gym(0, [1])];

describe('leagueBoardAtPlayhead', () => {
  it('uses the sitting snapshot when the session stored cards', () => {
    expect(
      leagueBoardAtPlayhead({
        sessionCards: early,
        latestCards: latest,
        isLatestSession: false,
      }),
    ).toEqual({ kind: 'captured', cards: early, presentIds: [1] });
  });

  it('does not paint latestCards for a historical sitting with no snapshot', () => {
    expect(
      leagueBoardAtPlayhead({
        sessionCards: undefined,
        latestCards: latest,
        isLatestSession: false,
      }),
    ).toEqual({ kind: 'uncaptured' });
  });

  it('falls back to latestCards only for the current sitting', () => {
    expect(
      leagueBoardAtPlayhead({
        sessionCards: undefined,
        latestCards: latest,
        isLatestSession: true,
      }),
    ).toEqual({ kind: 'latest', cards: latest });
  });

  it('treats an empty cards array as missing structure', () => {
    expect(
      leagueBoardAtPlayhead({
        sessionCards: [],
        latestCards: latest,
        isLatestSession: false,
      }),
    ).toEqual({ kind: 'uncaptured' });
  });
});

describe('leagueOccupancyAtPlayhead', () => {
  it('returns the sitting member ids when cards exist', () => {
    expect(leagueOccupancyAtPlayhead(early, false)).toEqual({ kind: 'members', ids: [1] });
  });

  it('returns none for a historical sitting with no snapshot', () => {
    expect(leagueOccupancyAtPlayhead(undefined, false)).toEqual({ kind: 'none' });
  });

  it('returns all for the current sitting with no snapshot', () => {
    expect(leagueOccupancyAtPlayhead(undefined, true)).toEqual({ kind: 'all' });
  });
});

describe('occupancyPresent', () => {
  it('maps all to null, none to an empty set, and members to those ids', () => {
    expect(occupancyPresent({ kind: 'all' })).toBeNull();
    expect(occupancyPresent({ kind: 'none' })).toEqual(new Set());
    expect(occupancyPresent({ kind: 'members', ids: [1, 4] })).toEqual(new Set([1, 4]));
  });
});
