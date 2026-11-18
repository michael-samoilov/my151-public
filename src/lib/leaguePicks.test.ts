import { describe, expect, it } from 'vitest';
import { LEAGUE_BOSS_ROW, type LeagueCardShape } from '../../api/_leagueRecord';
import { leaguePicks } from '../../api/_leaguePicks';
import { getAllPokemon, getPokemonById } from '@/hooks/usePokemonData';
import { BOSS_ROW } from '@/league/model/constants';
import { makePlacedLine, stageAt } from '@/league/model/engine';

const league = (...cards: LeagueCardShape[]) => ({ latestCards: cards });

describe('leaguePicks', () => {
  it('counts leagues, not cards: one browser with Pikachu on two electric gyms is one', () => {
    const picks = leaguePicks([
      league({ i: 0, t: 'electric', l: [{ b: [172, 25] }] }, { i: 3, t: 'electric', l: [{ b: [172, 25] }] }),
      league({ i: 5, t: 'electric', l: [{ b: [172, 25] }, { b: [81, 82] }] }),
    ]);
    expect(picks.byType.electric).toEqual([['25', 2], ['82', 1]]);
  });

  it('counts gyms, not leagues, per chosen type, and skips gyms with no type', () => {
    const picks = leaguePicks([
      league({ i: 0, t: 'electric', l: [{ b: [25] }] }, { i: 3, t: 'electric', l: [] }, { i: 4, l: [{ b: [1] }] }),
      league({ i: 5, t: 'electric', l: [{ b: [81] }] }, { i: 6, t: 'none', l: [{ b: [4] }] }),
    ]);
    expect(picks.gyms).toEqual({ electric: 3, none: 1 });
  });

  it('keeps an unchosen type out of every type section, and gives "no type" its own', () => {
    const picks = leaguePicks([
      league({ i: 0, l: [{ b: [1] }], ace: 1, aceId: 1 }, { i: 1, t: 'none', l: [{ b: [4] }] }),
    ]);
    expect(Object.keys(picks.byType)).toEqual(['none']);
    expect(picks.byType.none).toEqual([['4', 1]]);
    expect(picks.ace).toEqual([['1', 1]]);
  });

  it('counts the member a seat fields at the boss row, not the line leaf', () => {
    const onix: LeagueCardShape = { i: 1, t: 'rock', l: [{ b: [95, 208], bd: [1, LEAGUE_BOSS_ROW + 1] }], ace: 1, aceId: 95 };
    const picks = leaguePicks([league(onix)]);
    expect(picks.byType.rock).toEqual([['95', 1]]);
    expect(picks.ace).toEqual([['95', 1]]);
  });

  it('falls back to the seat\'s fielded member when the ace pick is stale or missing', () => {
    const picks = leaguePicks([
      league({ i: 0, t: 'fire', l: [{ b: [4, 5, 6] }, { b: [37, 38] }], ace: 2, aceId: 6 }),
      league({ i: 0, t: 'fire', l: [{ b: [37, 38] }], ace: 1 }),
      league({ i: 0, t: 'fire', l: [{ b: [58, 59] }] }),
      { latestCards: undefined },
    ]);
    expect(picks.ace).toEqual([['38', 2]]);
  });

  it('ranks by leagues, then by id, so equal counts keep one order', () => {
    const picks = leaguePicks([
      league({ i: 0, t: 'water', l: [{ b: [9] }, { b: [7] }] }),
      league({ i: 0, t: 'water', l: [{ b: [130] }] }),
      league({ i: 0, t: 'water', l: [{ b: [130] }] }),
    ]);
    expect(picks.byType.water).toEqual([['130', 2], ['7', 1], ['9', 1]]);
  });

  it('agrees with the app on which member a line without dragged stages fields at the boss row', () => {
    expect(LEAGUE_BOSS_ROW).toBe(BOSS_ROW);
    const pathTo = (id: number) => {
      const branch: number[] = [];
      for (let p = getPokemonById(id); p; p = p.evolvesFrom != null ? getPokemonById(p.evolvesFrom) : undefined) branch.unshift(p.id);
      return branch;
    };
    const short = getAllPokemon()
      .map((p) => pathTo(p.id))
      .filter((branch) => stageAt(makePlacedLine(branch), BOSS_ROW) !== branch.length - 1);
    expect(short).toEqual([]);
  });
});
