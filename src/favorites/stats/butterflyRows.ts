import type { PreferenceDimension } from './preferenceStats';
/** Match Dex's relative INDEXED contract, rather than percentage-point differences. */
export function preferenceButterflyRows(dimension: PreferenceDimension, populationSize: number) {
  return dimension.rows.map(row => ({
    key: row.key,
    count: Math.round(row.observed * dimension.observedCoverage * populationSize),
    deviation: dimension.observedCoverage > 0 && dimension.baselineCoverage > 0 && row.baseline > 0
      ? ((row.observed / row.baseline) - 1) * 100 : null,
  }));
}
