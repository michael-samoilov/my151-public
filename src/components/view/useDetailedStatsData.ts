import { useMemo } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useAnalytics, fullBaseline, type computeAnalytics } from '@/hooks/useAnalytics';
import { getPokemonByIds } from '@/hooks/usePokemonData';
import { countTypes, buildTypeRows } from '@/components/analytics/typeDistribution';
import { rowKey } from '@/components/analytics/butterflyRow';
import type { TypeName } from '@/types/pokemon';

/** Per-generation bar colours (mirrors the panel's palette). */
export const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

export interface StatsTypeDatum { type: TypeName; label: string; count: number; deviation: number; color: string }
export interface StatsGenDatum { gen: number; count: number; deviation: number; color: string }
export interface StatsBstBin { x: number; nationalPct: number; yoursPct: number }
export interface StatsBst {
  merged: StatsBstBin[];
  binSize: number;
  xDomain: [number, number];
  xTicks: number[];
  yDomain: number;
  yTicks: number[];
  yoursAvg: number;
  nationalAvg: number;
}

export interface DetailedStatsData {
  typeData: StatsTypeDatum[];
  genData: StatsGenDatum[];
  bst: StatsBst;
}

/** Align yours + national histograms to shared bins so they can be overlaid.
 *  (Shared by the on-screen panel and the export renderer.) */
function alignHistograms(
  yours: { bin: string; pct: number }[],
  national: { bin: string; pct: number }[],
  binSize: number,
  xTickInterval?: number,
) {
  const allBins = new Set<string>();
  for (const y of yours) allBins.add(y.bin);
  for (const n of national) allBins.add(n.bin);
  const bins = [...allBins].sort((a, b) => parseInt(a) - parseInt(b));
  const yoursMap = new Map(yours.map((y) => [y.bin, y.pct]));
  const nationalMap = new Map(national.map((n) => [n.bin, n.pct]));
  const merged = bins.map((bin) => ({
    x: parseInt(bin) + binSize / 2,
    nationalPct: nationalMap.get(bin) ?? 0,
    yoursPct: yoursMap.get(bin) ?? 0,
  }));
  const tickStep = xTickInterval ?? binSize;
  const minBin = parseInt(bins[0] ?? '0');
  const maxBin = parseInt(bins[bins.length - 1] ?? '0');
  const tickStart = Math.floor(minBin / tickStep) * tickStep;
  const tickEnd = maxBin + binSize;
  const xTicks: number[] = [];
  for (let t = tickStart; t <= tickEnd; t += tickStep) xTicks.push(t);
  const xDomain: [number, number] = [tickStart, tickEnd];
  const yMax = Math.max(...merged.map((d) => Math.max(d.nationalPct, d.yoursPct)), 1);
  const yDomain = Math.ceil(yMax / 10) * 10;
  const yTicks: number[] = [];
  for (let t = 0; t <= yDomain; t += 10) yTicks.push(t);
  return { merged, xTicks, xDomain, binSize, yDomain, yTicks };
}

/**
 * Computed data for the View "detailed stats" — type distribution, generation
 * origin, and base-stat-total histogram. Used both by the on-screen panel
 * (DetailedStatsPanel) and by the PNG exporter (which redraws these natively on
 * the export canvas), so both read from a single source of truth.
 */
export function detailedStatsData(
  sections: Record<string, number[]>,
  analytics: ReturnType<typeof computeAnalytics>,
): DetailedStatsData {
  const pokemon = getPokemonByIds(Object.values(sections).flat());
  const total = pokemon.length;
  const typeData: StatsTypeDatum[] =
    total === 0
      ? []
      : buildTypeRows(countTypes(pokemon), total, fullBaseline.typeProp)
          .sort((a, b) => b.deviation - a.deviation)
          .map((r) => ({ type: rowKey(r) as TypeName, label: r.label, count: r.count, deviation: r.deviation, color: r.color }));

  const genData: StatsGenDatum[] = analytics.generationDeviation
    .map((d, i) => ({
      gen: d.generation,
      count: d.count,
      deviation: d.deviation,
      color: GEN_COLORS[i % GEN_COLORS.length],
    }))
    .sort((a, b) => a.gen - b.gen);

  const h = alignHistograms(analytics.yourBstHistogram, analytics.nationalBstHistogram, 50, 100);
  const bst: StatsBst = {
    merged: h.merged,
    binSize: h.binSize,
    xDomain: h.xDomain,
    xTicks: h.xTicks,
    yDomain: h.yDomain,
    yTicks: h.yTicks,
    yoursAvg: analytics.bstStats.avg,
    nationalAvg: analytics.nationalAvgBst,
  };

  return { typeData, genData, bst };
}

export function useDetailedStatsData(): DetailedStatsData {
  const sections = usePokedexStore((s) => s.sections);
  const analytics = useAnalytics(false);
  return useMemo(() => detailedStatsData(sections, analytics), [sections, analytics]);
}
