/** Candidate-conditioned statistics. Summary pointers never enter this input. */
export type StatsPopulation = 'unique_forms' | 'unique_species' | 'filled_pick_cells';
export interface StatsEntry {
  id: number;
  speciesId: number;
  /** Empty or absent dimensions are unknown, never invented classifications. */
  attributes: Readonly<Record<string, readonly string[] | undefined>>;
}
export interface StatsPick { id: number; pool: readonly number[] }
export interface PreferenceRow { key: string; observed: number; baseline: number; deviation: number | null }
export interface PreferenceDimension {
  observedCoverage: number;
  baselineCoverage: number;
  rows: PreferenceRow[];
}

/**
 * Pools describe independent uniform choices in the occupied pick cells.
 * For unique populations, baseline weights are exact inclusion probabilities.
 * Their normalized distribution is a ratio of expected counts, not E[ratio].
 * Species attributes use the first supplied entry for that species. Supply
 * canonical species entries first when forms must collapse to species.
 */
export function computePreferenceStats(
  entries: readonly StatsEntry[], picks: readonly StatsPick[], population: StatsPopulation,
) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const species = new Map<number, StatsEntry>();
  for (const entry of entries) if (!species.has(entry.speciesId)) species.set(entry.speciesId, entry);
  const key = (entry: StatsEntry) => population === 'unique_species' ? entry.speciesId : entry.id;
  const representative = (entry: StatsEntry) => population === 'unique_species' ? species.get(entry.speciesId)! : entry;
  const observed = new Map<number, { entry: StatsEntry; weight: number }>();
  const absent = new Map<number, number>();
  const expected = new Map<number, { entry: StatsEntry; weight: number }>();
  for (const pick of picks) {
    const pool = [...new Set(pick.pool)];
    const selected = byId.get(pick.id);
    if (!pool.length || !pool.includes(pick.id) || !selected || pool.some(id => !byId.has(id))) {
      throw new Error('Statistics require a valid selected candidate in every occupied pool.');
    }
    const selectedKey = key(selected);
    observed.set(selectedKey, { entry: representative(selected), weight: population === 'filled_pick_cells'
      ? (observed.get(selectedKey)?.weight ?? 0) + 1 : 1 });
    const probabilities = new Map<number, { entry: StatsEntry; probability: number }>();
    for (const id of pool) {
      const entry = byId.get(id)!;
      const candidateKey = key(entry);
      const prior = probabilities.get(candidateKey)?.probability ?? 0;
      probabilities.set(candidateKey, { entry: representative(entry), probability: prior + 1 / pool.length });
    }
    for (const [candidateKey, { entry, probability }] of probabilities) {
      if (population === 'filled_pick_cells') {
        expected.set(candidateKey, { entry, weight: (expected.get(candidateKey)?.weight ?? 0) + probability });
      } else {
        const remaining = (absent.get(candidateKey) ?? 1) * (1 - probability);
        absent.set(candidateKey, remaining);
        expected.set(candidateKey, { entry, weight: 1 - remaining });
      }
    }
  }
  const total = (values: typeof observed) => [...values.values()].reduce((sum, value) => sum + value.weight, 0);
  const populationSize = total(observed);
  const expectedPopulationSize = total(expected);
  const dimensions: Record<string, PreferenceDimension> = {};
  const names = new Set(entries.flatMap(entry => Object.keys(entry.attributes)));
  for (const dimension of names) {
    function tally(values: typeof observed) {
      const counts = new Map<string, number>();
      let known = 0;
      for (const { entry, weight } of values.values()) {
        const categories = [...new Set(entry.attributes[dimension] ?? [])];
        if (!categories.length) continue;
        known += weight;
        for (const category of categories) counts.set(category, (counts.get(category) ?? 0) + weight);
      }
      return { counts, known };
    }
    const yours = tally(observed), baseline = tally(expected);
    const categories = new Set([...yours.counts.keys(), ...baseline.counts.keys()]);
    dimensions[dimension] = {
      observedCoverage: populationSize ? yours.known / populationSize : 0,
      baselineCoverage: expectedPopulationSize ? baseline.known / expectedPopulationSize : 0,
      rows: [...categories].map(category => {
        const fraction = yours.known ? (yours.counts.get(category) ?? 0) / yours.known : 0;
        const reference = baseline.known ? (baseline.counts.get(category) ?? 0) / baseline.known : 0;
        return { key: category, observed: fraction, baseline: reference, deviation: yours.known && baseline.known ? fraction - reference : null };
      }),
    };
  }
  return { populationSize, expectedPopulationSize, dimensions };
}
