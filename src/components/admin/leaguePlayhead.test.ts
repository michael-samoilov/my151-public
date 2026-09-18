import { describe, expect, it } from 'vitest';
import { sessionCards } from './leaguePlayhead';

const gym = (i: number, ids: number[]) => ({ i, l: [{ b: ids }] });

describe('sessionCards', () => {
  it('returns the sitting snapshot when cards exist', () => {
    const cards = [gym(0, [1, 4])];
    expect(sessionCards(cards)).toBe(cards);
  });

  it('returns null when the sitting stored no cards', () => {
    expect(sessionCards(undefined)).toBeNull();
    expect(sessionCards([])).toBeNull();
  });
});
