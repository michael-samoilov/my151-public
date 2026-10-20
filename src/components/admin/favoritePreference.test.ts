import {describe, expect, it, vi} from 'vitest';
import cellData from '../../../api/_favoriteCells.json';
import {favoritePicks, favoritePreference, fitFavoritePreference, favoriteSpeciesId} from '../../../api/_favoriteAggregate';
import {parseFavoriteSnapshot, type FavoriteRecord} from '../../../api/_favoriteRecord';

const record = (fills: Record<string, number>): FavoriteRecord => ({
  latest: {v: 1, fills},
} as FavoriteRecord);
const cells = cellData as Record<string, {kind: string; ids?: number[]; sources?: string[]}>;

describe('favorite preference evidence', () => {
  it('does not let unpicked Unown forms inflate Espeon preference', () => {
    const result = favoritePreference(Array.from({length: 20}, () => record({'psychic|2': 196})));
    const ids = [199, 238, 196, 177, 178, 202, 203, 249, 251, 201];
    const expected = fitFavoritePreference([{ids, wins: ids.map(id => id === 196 ? 20 : 0)}]);
    expect(result.candidates).toBe(10);
    expect(result.entries[0].score).toBeCloseTo(expected.scores[expected.ids.indexOf(196)], 8);
  });

  it('combines Charizard forms without altering raw per-cell counts', () => {
    const fills = {'fire|1': 6, 'gimmick|1': 10034, 'fire|gimmick': 10035, 'dragon|gimmick': 10034};
    for (const [key, id] of Object.entries(fills)) expect(cells[key].ids).toContain(id);
    const picks = favoritePicks([record(fills)]);
    expect(picks.preference!.entries).toHaveLength(1);
    expect(picks.preference!.entries[0]).toMatchObject({id: 6, picks: 4, charts: 1});
    expect(picks.cells['gimmick|1']).toEqual([[10034, 1]]);
    expect(picks.cells['fire|gimmick']).toEqual([[10035, 1]]);
    expect(picks.top).toContainEqual([10034, 1]);
  });

  it('counts a species once per selector pane, however many forms the pane lists', () => {
    // A pick of another Pokémon must not count as one loss per listed form of a
    // repeated species (psychic|2 lists 26 Unown forms). One chart picks another
    // Pokémon in every such pane; a second picks the repeated species itself.
    const panes = Object.entries(cells).filter(([, cell]) =>
      cell.kind === 'pick' && new Set(cell.ids!.map(favoriteSpeciesId)).size < cell.ids!.length);
    expect(panes.length).toBeGreaterThan(100);
    const other: Record<string, number> = {};
    const repeatedPick: Record<string, number> = {};
    const pools = panes.flatMap(([key, cell]) => {
      const species = cell.ids!.map(favoriteSpeciesId);
      const repeated = new Set(species.filter((id, i) => species.indexOf(id) !== i));
      other[key] = cell.ids!.find(id => !repeated.has(favoriteSpeciesId(id))) ?? cell.ids![0];
      repeatedPick[key] = cell.ids!.find(id => repeated.has(favoriteSpeciesId(id)))!;
      const ids = [...new Set(species)];
      return [other[key], repeatedPick[key]].map(pick => ({ids, wins: ids.map(id => id === favoriteSpeciesId(pick) ? 1 : 0)}));
    });
    const result = favoritePreference([record(other), record(repeatedPick)]);
    const expected = fitFavoritePreference(pools);
    expect(result.converged).toBe(true);
    expect(result.candidates).toBe(expected.ids.length);
    const scored = result.entries.filter(entry => entry.score !== null);
    expect(scored.length).toBeGreaterThan(100);
    for (const entry of scored) expect(entry.score).toBeCloseTo(expected.scores[expected.ids.indexOf(entry.id)], 8);
  });

  it('does not treat favorite pointers between forms of one species as comparisons', () => {
    const direct = {'fire|1': 6, 'gimmick|1': 10034};
    const before = favoritePreference([record(direct)]);
    const after = favoritePreference([record({...direct, 'favorite|1': 10034})]);
    expect(after.choices).toBe(before.choices);
    expect(after.entries[0]).toMatchObject({id: 6, picks: 3, charts: 1});
    expect(after.entries[0].score).toBe(before.entries[0].score);
  });

  it('preserves species boundaries across regional IDs, evolutions, and lookalikes', () => {
    expect(favoriteSpeciesId(10100)).toBe(26);
    expect(favoriteSpeciesId(10179)).toBe(562);
    expect(favoriteSpeciesId(10180)).toBe(618);
    expect(favoriteSpeciesId(11072)).toBe(555);
    expect(favoriteSpeciesId(10191)).toBe(892);
    expect(favoriteSpeciesId(10227)).toBe(892);
    expect(favoriteSpeciesId(133)).not.toBe(favoriteSpeciesId(196));
    expect(favoriteSpeciesId(50)).not.toBe(favoriteSpeciesId(960));
    for (const cell of Object.values(cells)) {
      for (const id of cell.ids ?? []) expect(Number.isSafeInteger(favoriteSpeciesId(id))).toBe(true);
    }
  });

  it('does not mistake blank and forced selections for preference comparisons', () => {
    const result = favoritePreference([record({}), record({'ghost|2': 200, 'dragon|2': 230})]);
    expect(result.choices).toBe(0);
    expect(result.charts).toBe(0);
    expect(result.candidates).toBe(0);
    expect(result.entries).toEqual([
      {id: 200, score: null, picks: 1, charts: 1, component: null, evidencePicks: 0},
      {id: 230, score: null, picks: 1, charts: 1, component: null, evidencePicks: 0},
    ]);
  });

  it('reconstructs pointer alternatives once per identity despite repeated source picks', () => {
    const fills = {'fire|1': 6, 'flying|1': 6, 'water|1': 7, 'favorite|1': 6};
    const result = favoritePreference([record(fills)]);
    const pools = ['fire|1', 'flying|1', 'water|1'].map(key => {
      const ids = [...new Set(cells[key].ids!.map(favoriteSpeciesId))];
      return {ids, wins: ids.map(id => id === fills[key as keyof typeof fills] ? 1 : 0)};
    });
    pools.push({ids: [6, 7], wins: [1, 0]});
    const expected = fitFavoritePreference(pools);
    expect(result.choices).toBe(4);
    expect(result.entries.find(entry => entry.id === 6)).toMatchObject({picks: 3, charts: 1, evidencePicks: 3});
    for (const entry of result.entries) {
      expect(entry.score).toBeCloseTo(expected.scores[expected.ids.indexOf(entry.id)], 8);
    }
  });

  it('uses valid current charts once and rejects invalid or orphan selections', () => {
    const current = record({'fire|1': 4, 'ghost|2': 6, 'favorite|2': 6});
    current.sessionLog = [{
      id: 'historical-session',
      ts: 1,
      endTs: 2,
      events: [],
      snapshot: parseFavoriteSnapshot({v: 1, fills: {'fire|1': 6}})!,
    }];
    const result = favoritePreference([current]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({id: 4, picks: 1, charts: 1, evidencePicks: 1});
    expect(result.choices).toBe(1);
    expect(result.candidates).toBe(new Set(cells['fire|1'].ids!.map(favoriteSpeciesId)).size);
    const picks = favoritePicks([record({'fire|1': 4})]);
    expect(picks.top).toEqual([[4, 1]]);
    expect(picks.cells).toEqual({'fire|1': [[4, 1]]});
    expect(picks.preference?.entries[0].id).toBe(4);
  });

  it('reuses exact current cohorts but invalidates changed winners and removed charts', () => {
    const firstRecord = record({'fire|1': 4});
    firstRecord.cid = 'first';
    const secondRecord = record({'water|1': 7});
    secondRecord.cid = 'second';
    const first = favoritePreference([firstRecord, secondRecord]);
    expect(favoritePreference([secondRecord, firstRecord])).toBe(first);
    const changedRecord = record({'fire|1': 5});
    changedRecord.cid = 'first';
    const changed = favoritePreference([changedRecord, secondRecord]);
    expect(changed.entries.some(entry => entry.id === 4)).toBe(false);
    expect(changed.entries.some(entry => entry.id === 5)).toBe(true);
    const removed = favoritePreference([secondRecord]);
    expect(removed.charts).toBe(1);
    expect(removed.entries.map(entry => entry.id)).toEqual([7]);
  });

  it('does not retain a timed-out estimate when the same cohort is retried', () => {
    const current = record({'fire|1': 38});
    current.cid = 'budget-retry';
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValueOnce(0).mockReturnValue(3000);
    try {
      expect(favoritePreference([current]).converged).toBe(false);
    } finally {
      clock.mockRestore();
    }
    expect(favoritePreference([current]).converged).toBe(true);
  });

  it('allows a multi-option pointer to compare otherwise forced direct selections', () => {
    const result = favoritePreference([record({'ghost|2': 200, 'dragon|2': 230, 'favorite|2': 200})]);
    expect(result.choices).toBe(1);
    expect(result.candidates).toBe(2);
    expect(result.entries.find(entry => entry.id === 200)).toMatchObject({picks: 2, evidencePicks: 1});
    expect(result.entries.find(entry => entry.id === 230)).toMatchObject({picks: 1, evidencePicks: 0});
    expect(result.entries.find(entry => entry.id === 200)?.score).not.toBeNull();
    expect(result.entries.find(entry => entry.id === 230)?.score).toBeNull();
  });
});

describe('favorite preference numerical fit', () => {
  it('finishes a fit whose last Newton step gains less than the objective value can resolve', () => {
    // Near the optimum of this seeded 120-chart cohort, a step's predicted gain
    // is below the rounding of the objective value. A value-only line search
    // shrank every step to nothing and stopped at the iteration limit, so the
    // admin showed "Preference strength unavailable".
    let seed = 4;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const keys = Object.keys(cells);
    const charts = Array.from({length: 120}, () => {
      const fills: Record<string, number> = {};
      for (const key of keys) {
        const ids = cells[key].ids;
        if (cells[key].kind === 'pick' && ids && rand() < 0.55) fills[key] = ids[Math.floor(rand() * ids.length)];
      }
      for (const key of keys) {
        if (cells[key].kind !== 'pointer' || rand() > 0.5) continue;
        const options = (cells[key].sources ?? []).map(source => fills[source]).filter((id): id is number => id !== undefined);
        if (options.length) fills[key] = options[Math.floor(rand() * options.length)];
      }
      return record(fills);
    });
    const result = favoritePreference(charts);
    expect(result.converged).toBe(true);
    expect(result.gradientResidual).toBeLessThanOrEqual(1e-7);
    expect(result.entries.filter(entry => entry.score !== null).length).toBeGreaterThan(100);
  });

  it('keeps every displayed estimate unavailable when a numerical time budget expires', () => {
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValueOnce(0).mockReturnValue(3000);
    try {
      const result = favoritePreference([record({'fire|1': 5})]);
      expect(result.converged).toBe(false);
      expect(result.entries.every(entry => entry.score === null)).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  it('gives equal strengths to symmetric evidence and does not fit blank or singleton pools', () => {
    const result = fitFavoritePreference([
      {ids: [1, 2, 3], wins: [5, 5, 5]},
      {ids: [999], wins: [100]},
      {ids: [888, 889], wins: [0, 0]},
    ]);
    expect(result.ids).toEqual([1, 2, 3]);
    expect(result.scores).toEqual([1, 1, 1]);
    expect(result.converged).toBe(true);
  });

  it('credits a losing but selected candidate and responds to an additional win', () => {
    const before = fitFavoritePreference([{ids: [1, 2, 3], wins: [1, 9, 0]}]);
    const after = fitFavoritePreference([{ids: [1, 2, 3], wins: [2, 9, 0]}]);
    expect(before.scores[1]).toBeGreaterThan(before.scores[0]);
    expect(before.scores[0]).toBeGreaterThan(before.scores[2]);
    expect(after.scores[0]).toBeGreaterThan(before.scores[0]);
    expect(before.converged && after.converged).toBe(true);
  });

  it('detects disconnected pools and returns reproducible finite estimates under separation', () => {
    const pools = [{ids: [1, 2], wins: [100, 0]}, {ids: [3, 4], wins: [0, 100]}];
    const first = fitFavoritePreference(pools);
    expect(first.components).toEqual([[1, 2], [3, 4]]);
    expect(first.scores.every(score => Number.isFinite(score) && score > 0)).toBe(true);
    expect(first.converged).toBe(true);
    expect(fitFavoritePreference(pools)).toEqual(first);
  });
});
