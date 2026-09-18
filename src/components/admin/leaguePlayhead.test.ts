import { describe, expect, it } from 'vitest';
import { leagueOccupancyAtPlayhead, occupancyPresent } from './leaguePlayhead';

const gym = (i: number, ids: number[]) => ({ i, l: [{ b: ids }] });
const early = [gym(0, [1])];

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

  it('treats an empty cards array as missing structure', () => {
    expect(leagueOccupancyAtPlayhead([], false)).toEqual({ kind: 'none' });
  });
});

describe('occupancyPresent', () => {
  it('maps all to null, none to an empty set, and members to those ids', () => {
    expect(occupancyPresent({ kind: 'all' })).toBeNull();
    expect(occupancyPresent({ kind: 'none' })).toEqual(new Set());
    expect(occupancyPresent({ kind: 'members', ids: [1, 4] })).toEqual(new Set([1, 4]));
  });
});
