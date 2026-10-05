// keeps: overlapping eligible pools and species collapse have combinations browser fixtures cannot exhaust.
import { describe, it, expect } from 'vitest';
import { computePreferenceStats, type StatsEntry } from './preferenceStats';
const entries: StatsEntry[] = [
  { id: 1, speciesId: 1, attributes: { type: ['grass'], color: ['green'] } },
  { id: 2, speciesId: 1, attributes: { type: ['water'], color: ['blue'] } },
  { id: 3, speciesId: 3, attributes: { type: ['fire'] } },
];
const cells = [{ id: 1, pool: [1, 2] }, { id: 1, pool: [1, 3] }];
describe('preference statistics', () => {
  it('does not turn repeated forms into unique votes', () => {
    const result = computePreferenceStats(entries, cells, 'unique_forms');
    expect(result.populationSize).toBe(1);
    expect(result.dimensions.type.rows.find(r => r.key === 'grass')?.observed).toBe(1);
    // Independent draws produce expected counts 3/4, 1/2, 1/2.
    expect(result.dimensions.type.rows.find(r => r.key === 'grass')?.baseline).toBeCloseTo(3 / 7);
  });
  it('counts independent pick cells without counting absent summary pointers', () => {
    expect(computePreferenceStats(entries, cells, 'filled_pick_cells').populationSize).toBe(2);
    expect(computePreferenceStats(entries, [], 'unique_forms').populationSize).toBe(0);
  });
  it('collapses forms to species before absence probabilities', () => {
    const result = computePreferenceStats(entries, cells, 'unique_species');
    expect(result.populationSize).toBe(1);
    expect(result.expectedPopulationSize).toBe(1.5);
    expect(result.dimensions.color.rows.find(r => r.key === 'green')?.baseline).toBe(1);
  });
  it('discloses missing categories instead of assigning invented values', () => {
    const result = computePreferenceStats(entries, [{ id: 3, pool: [1, 3] }], 'unique_forms');
    expect(result.dimensions.color.observedCoverage).toBe(0);
    expect(result.dimensions.color.baselineCoverage).toBe(0.5);
    expect(result.dimensions.color.rows[0].deviation).toBeNull();
  });
  it('conditions a partial chart only on its occupied cells', () => {
    const result = computePreferenceStats(entries, [{ id: 1, pool: [1] }], 'unique_forms');
    expect(result.dimensions.type.rows.find(r => r.key === 'grass')?.deviation).toBe(0);
  });
  it('rejects invalid selections and empty pools before computing preferences', () => {
    expect(() => computePreferenceStats(entries, [{ id: 1, pool: [] }], 'unique_forms')).toThrow();
    expect(() => computePreferenceStats(entries, [{ id: 1, pool: [3] }], 'unique_forms')).toThrow();
  });
});
