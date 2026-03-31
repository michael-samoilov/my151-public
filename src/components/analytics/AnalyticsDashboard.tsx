import React, { useMemo, useState } from 'react';
import { useAnalytics, fullBaseline, filteredBaseline } from '@/hooks/useAnalytics';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { WhatsAdvisor } from './WhatsAdvisor';
import { ButterflyChart, type ButterflyRow } from './ButterflyChart';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import { getPokemonById, getAllPokemon } from '@/hooks/usePokemonData';
import { TYPE_NAMES } from '@/types/pokemon';
import { STARTER_IDS } from '@/data/categories';
import { SuperimposedHistogram } from './SuperimposedHistogram';
import { GEN_STOPS } from '@/components/shared/GenBadge';

const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

const POKEAPI_TYPE_IDS: Record<string, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6,
  bug: 7, ghost: 8, steel: 9, fire: 10, water: 11, grass: 12,
  electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
};
const TYPE_ICON_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(POKEAPI_TYPE_IDS).map(([type, id]) => [
    type,
    `/sprites/types/${id}.png`,
  ]),
);

/** Align yours + national histograms to the same bins, merge into single dataset */
function alignHistograms(
  yours: { bin: string; pct: number }[],
  national: { bin: string; pct: number }[],
  binSize: number,
  xTickInterval?: number,
) {
  // Collect all bins from both
  const allBins = new Set<string>();
  for (const y of yours) allBins.add(y.bin);
  for (const n of national) allBins.add(n.bin);
  const bins = [...allBins].sort((a, b) => parseInt(a) - parseInt(b));

  const yoursMap = new Map(yours.map(y => [y.bin, y.pct]));
  const nationalMap = new Map(national.map(n => [n.bin, n.pct]));

  // Merged data: one entry per bin with both pct values
  const merged = bins.map(bin => ({
    x: parseInt(bin) + binSize / 2,
    nationalPct: nationalMap.get(bin) ?? 0,
    yoursPct: yoursMap.get(bin) ?? 0,
  }));

  // X-axis boundary ticks
  const tickStep = xTickInterval ?? binSize;
  const minBin = parseInt(bins[0]);
  const maxBin = parseInt(bins[bins.length - 1]);
  const tickStart = Math.floor(minBin / tickStep) * tickStep;
  const tickEnd = maxBin + binSize;
  const xTicks: number[] = [];
  for (let t = tickStart; t <= tickEnd; t += tickStep) xTicks.push(t);
  const xDomain: [number, number] = [tickStart, tickEnd];

  const yMax = Math.max(
    ...merged.map(d => Math.max(d.nationalPct, d.yoursPct)),
    1,
  );
  const yDomain = Math.ceil(yMax / 10) * 10;
  const yTicks: number[] = [];
  for (let t = 0; t <= yDomain; t += 10) yTicks.push(t);

  return { merged, xTicks, xDomain, binSize, yDomain, yTicks };
}

export function AnalyticsDashboard() {
  const [excludeSpecial, setExcludeSpecial] = useState(false);
  const [excludeSpecialMekko, setExcludeSpecialMekko] = useState(false);
  const [selectedTypeChart, setSelectedTypeChart] = useState<string>('yours');
  const [newPokemonOnly, setNewPokemonOnly] = useState(true);

  const analytics = useAnalytics();
  const sections = usePokedexStore((s) => s.sections);

  // "Yours" type chart — computed locally so excludeSpecial only affects this chart
  const typeChartData: ButterflyRow[] = useMemo(() => {
    const base = excludeSpecial ? filteredBaseline : fullBaseline;
    const allIds = Object.values(sections).flat();
    const starterSectionIds = new Set(sections['starter'] ?? []);
    let pokemon = allIds.map(id => getPokemonById(id)).filter(Boolean).map(p => p!);
    if (excludeSpecial) {
      pokemon = pokemon.filter(p => !p.isLegendary && !p.isMythical && !starterSectionIds.has(p.id));
    }
    const total = pokemon.length;
    if (total === 0) return [];

    const typeCounts: Record<string, number> = {};
    for (const t of TYPE_NAMES) typeCounts[t] = 0;
    for (const p of pokemon) {
      for (const t of p.types) typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    return TYPE_NAMES.map(t => {
      const yourProportion = typeCounts[t] / total;
      const globalProportion = base.typeProp[t];
      const deviation = globalProportion > 0 ? ((yourProportion / globalProportion) - 1) * 100 : 0;
      return {
        label: t.charAt(0).toUpperCase() + t.slice(1),
        count: typeCounts[t],
        deviation,
        color: TYPE_COLORS[t as keyof typeof TYPE_COLORS],
        icon: TYPE_ICON_URLS[t],
      };
    }).sort((a, b) => b.deviation - a.deviation);
  }, [sections, excludeSpecial]);

  const genChartData: ButterflyRow[] = useMemo(() =>
    analytics.generationDeviation.map((d, i) => {
      const gen = d.generation;
      const stops = GEN_STOPS[gen] ?? [{ offset: '100%', color: '#888' }];
      return {
        label: `Gen ${gen}`,
        count: d.count,
        deviation: d.deviation,
        color: GEN_COLORS[i % GEN_COLORS.length],
        icon: (x: number, y: number, size: number) => {
          const gradId = `gen-icon-grad-${gen}`;
          const r = size / 2;
          return (
            <React.Fragment key={`gen-icon-${gen}`}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                  {stops.map((s, si) => (
                    <stop key={si} offset={s.offset} stopColor={s.color} />
                  ))}
                </linearGradient>
              </defs>
              <circle cx={x + r} cy={y + r} r={r} fill={`url(#${gradId})`} />
              <text
                x={x + r} y={y + r} textAnchor="middle" dominantBaseline="central"
                fill="white" fontSize={size * 0.55} fontWeight="800"
                fontFamily="system-ui, sans-serif"
                paintOrder="stroke" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5"
              >
                {gen}
              </text>
            </React.Fragment>
          );
        },
      };
    }),
    [analytics.generationDeviation],
  );

  // Compute type chart data for a regional/national dex
  const regionalTypeChartData: ButterflyRow[] = useMemo(() => {
    if (selectedTypeChart === 'yours') return [];
    const dex = REGIONAL_DEXES.find(d => d.id === selectedTypeChart);
    const isNational = selectedTypeChart === 'national';
    if (!dex && !isNational) return [];

    const base = excludeSpecial ? filteredBaseline : fullBaseline;
    let pokemon = isNational
      ? getAllPokemon()
      : dex!.pokemonIds.map(id => getPokemonById(id)).filter(Boolean).map(p => p!);
    if (excludeSpecial) {
      pokemon = pokemon.filter(p => !p.isLegendary && !p.isMythical && !STARTER_IDS.has(p.id));
    }
    if (newPokemonOnly && dex) {
      pokemon = pokemon.filter(p => p.generation === dex.generation);
    }
    const total = pokemon.length;
    if (total === 0) return [];

    const typeCounts: Record<string, number> = {};
    for (const t of TYPE_NAMES) typeCounts[t] = 0;
    for (const p of pokemon) {
      for (const t of p.types) typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    return TYPE_NAMES.map(t => {
      const yourProportion = typeCounts[t] / total;
      const globalProportion = base.typeProp[t];
      const ratio = globalProportion > 0 ? yourProportion / globalProportion : 0;
      const deviation = globalProportion > 0 ? (ratio - 1) * 100 : 0;
      return {
        label: t.charAt(0).toUpperCase() + t.slice(1),
        count: typeCounts[t],
        deviation,
        color: TYPE_COLORS[t as keyof typeof TYPE_COLORS],
        icon: TYPE_ICON_URLS[t],
      };
    }).sort(isNational
      ? (a, b) => b.count - a.count
      : (a, b) => b.deviation - a.deviation);
  }, [selectedTypeChart, excludeSpecial, newPokemonOnly]);

  const activeTypeChartData = selectedTypeChart === 'yours' ? typeChartData : regionalTypeChartData;
  const isNationalSelected = selectedTypeChart === 'national';
  const selectedDex = REGIONAL_DEXES.find(d => d.id === selectedTypeChart);

  // Fixed axis extents — max across all toggle permutations (exclusion × gen-only/regional)
  // so toggling filters only shrinks bars, never shifts axes
  const { fixedMaxCount: unfilteredMaxCount, fixedDevRight } = useMemo(() => {
    const DEV_OVER_CAP = 200;
    const computeDevRight = (deviations: number[]) => {
      const maxDev = Math.max(...deviations, 50);
      return Math.min(Math.ceil(maxDev / 50) * 50, DEV_OVER_CAP);
    };
    const computeTypeStats = (pokemon: ReturnType<typeof getPokemonById>[], base: typeof fullBaseline) => {
      const total = pokemon.length;
      if (total === 0) return { maxCount: 1, devRight: 50 };
      const typeCounts: Record<string, number> = {};
      for (const t of TYPE_NAMES) typeCounts[t] = 0;
      for (const p of pokemon) {
        for (const t of p!.types) typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
      const deviations = TYPE_NAMES.map(t => {
        const prop = typeCounts[t] / total;
        const baseProp = base.typeProp[t];
        return baseProp > 0 ? ((prop / baseProp) - 1) * 100 : 0;
      });
      return {
        maxCount: Math.max(...Object.values(typeCounts), 1),
        devRight: computeDevRight(deviations),
      };
    };

    if (selectedTypeChart === 'yours') {
      // For "yours": permutations are exclusion on/off (no gen-only toggle)
      const allIds = Object.values(sections).flat();
      const allPokemon = allIds.map(id => getPokemonById(id)).filter(Boolean).map(p => p!);
      const starterIds = new Set(sections['starter'] ?? []);
      const filteredPokemon = allPokemon.filter(p => !p.isLegendary && !p.isMythical && !starterIds.has(p.id));
      const s1 = computeTypeStats(allPokemon, fullBaseline);
      const s2 = computeTypeStats(filteredPokemon, filteredBaseline);
      return {
        fixedMaxCount: Math.max(s1.maxCount, s2.maxCount),
        fixedDevRight: Math.max(s1.devRight, s2.devRight),
      };
    }

    if (isNationalSelected) {
      const allPokemon = getAllPokemon();
      const filteredPokemon = allPokemon.filter(p => !p.isLegendary && !p.isMythical && !STARTER_IDS.has(p.id));
      const s1 = computeTypeStats(allPokemon, fullBaseline);
      const s2 = computeTypeStats(filteredPokemon, filteredBaseline);
      return {
        fixedMaxCount: Math.max(s1.maxCount, s2.maxCount),
        fixedDevRight: undefined,
      };
    }

    const dex = REGIONAL_DEXES.find(d => d.id === selectedTypeChart);
    if (!dex) return { fixedMaxCount: undefined, fixedDevRight: undefined };

    // Up to 4 permutations: (exclusion on/off) × (gen-only/regional-dex)
    const allInDex = dex.pokemonIds.map(id => getPokemonById(id)).filter(Boolean).map(p => p!);
    const genOnly = allInDex.filter(p => p.generation === dex.generation);
    const permutations = [allInDex, genOnly];
    let maxCount = 1;
    let maxDevRight = 50;
    for (const set of permutations) {
      const unfiltered = computeTypeStats(set, fullBaseline);
      const filtered = computeTypeStats(
        set.filter(p => !p.isLegendary && !p.isMythical && !STARTER_IDS.has(p.id)),
        filteredBaseline,
      );
      maxCount = Math.max(maxCount, unfiltered.maxCount, filtered.maxCount);
      maxDevRight = Math.max(maxDevRight, unfiltered.devRight, filtered.devRight);
    }
    return { fixedMaxCount: maxCount, fixedDevRight: maxDevRight };
  }, [selectedTypeChart, isNationalSelected, sections, analytics.typeDeviation]);

  const evoHist = useMemo(
    () => alignHistograms(analytics.yourEvoHistogram, analytics.nationalEvoHistogram, 5),
    [analytics.yourEvoHistogram, analytics.nationalEvoHistogram],
  );
  const bstHist = useMemo(
    () => alignHistograms(analytics.yourBstHistogram, analytics.nationalBstHistogram, 50, 100),
    [analytics.yourBstHistogram, analytics.nationalBstHistogram],
  );

  // Compute fixed Y-axis max across both toggle states for stable chart
  const fixedMaxColTotal = useMemo(() => {
    const allIdSet = new Set(Object.values(sections).flat());
    const starterSectionIds = new Set(sections['starter'] ?? []);
    const allPokemon = [...allIdSet].map(id => getPokemonById(id)).filter(Boolean).map(p => p!);
    const filteredPokemon = allPokemon.filter(p => !p.isLegendary && !p.isMythical && !starterSectionIds.has(p.id));

    const chainMaxStage = new Map<number, number>();
    for (const p of getAllPokemon()) {
      const cur = chainMaxStage.get(p.evolutionChainId) || 0;
      chainMaxStage.set(p.evolutionChainId, Math.max(cur, p.evolutionStage));
    }

    const getMaxCol = (pokemon: typeof allPokemon) => {
      const counts: Record<number, number> = {};
      for (const p of pokemon) {
        const lineLen = Math.min(chainMaxStage.get(p.evolutionChainId) || 1, 3);
        counts[lineLen] = (counts[lineLen] || 0) + 1;
      }
      return Math.max(...Object.values(counts), 0);
    };

    return Math.max(getMaxCol(allPokemon), getMaxCol(filteredPokemon));
  }, [sections]);

  // Mekko chart data: group user's pokemon by evolution chain length
  const mekkoData = useMemo(() => {
    const allIdSet = new Set(Object.values(sections).flat());
    const starterSectionIds = new Set(sections['starter'] ?? []);
    let pokemon = [...allIdSet].map(id => getPokemonById(id)).filter(Boolean).map(p => p!);
    if (excludeSpecialMekko) {
      pokemon = pokemon.filter(p => !p.isLegendary && !p.isMythical && !starterSectionIds.has(p.id));
    }

    // Determine the true max stage for each chain from ALL pokemon (not just user's)
    const chainMaxStage = new Map<number, number>();
    for (const p of getAllPokemon()) {
      const cur = chainMaxStage.get(p.evolutionChainId) || 0;
      chainMaxStage.set(p.evolutionChainId, Math.max(cur, p.evolutionStage));
    }

    // Count each of the user's pokemon once, grouped by chain length and stage
    const stageCountsByLineLength: Record<number, Record<number, number>> = {};
    const chainsPerLength: Record<number, Set<number>> = {};

    for (const p of pokemon) {
      const lineLen = Math.min(chainMaxStage.get(p.evolutionChainId) || 1, 3);
      const stage = Math.min(p.evolutionStage, 3);

      if (!stageCountsByLineLength[lineLen]) stageCountsByLineLength[lineLen] = {};
      stageCountsByLineLength[lineLen][stage] = (stageCountsByLineLength[lineLen][stage] || 0) + 1;

      if (!chainsPerLength[lineLen]) chainsPerLength[lineLen] = new Set();
      chainsPerLength[lineLen].add(p.evolutionChainId);
    }

    const totalChains = new Set(pokemon.map(p => p.evolutionChainId)).size;
    const columns: { lineLength: number; chainCount: number; widthPct: number; segments: { stage: number; count: number }[] }[] = [];
    for (const len of [1, 2, 3]) {
      const chainCount = chainsPerLength[len]?.size || 0;
      if (chainCount === 0) continue;
      const widthPct = (chainCount / totalChains) * 100;
      const segments: { stage: number; count: number }[] = [];
      for (let s = 1; s <= len; s++) {
        segments.push({ stage: s, count: stageCountsByLineLength[len]?.[s] || 0 });
      }
      columns.push({ lineLength: len, chainCount, widthPct, segments });
    }

    return { columns, totalLines: totalChains };
  }, [sections, excludeSpecialMekko]);

  if (analytics.total === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-muted-foreground">No Pokemon assigned yet</p>
          <p className="text-sm text-muted-foreground">
            Add Pokemon to your Pokedex to see analytics
          </p>
        </div>
      </div>
    );
  }

  const STAGE_COLORS = ['#f5a3a3', '#e56060', '#dc2626'];

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      {/* Header — matches build pane style, no gear icon */}
      <div className="flex items-center justify-between px-4 py-2 border-b h-11">
        <h2 className="text-2xl font-extrabold tracking-tight leading-none">
          <span className="text-primary">{analytics.total}</span>
          <span className="text-foreground">/151</span>
        </h2>
      </div>

      <div className="p-6 space-y-8 max-w-6xl mx-auto">
        {/* What's Missing Advisor — moved to top */}
        <section className="bg-card rounded-lg border p-6">
          <WhatsAdvisor />
        </section>

        {/* Type Distribution */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Type Distribution</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Count and deviation from national dex proportions. Sorted most over- to most underrepresented.
          </p>

          {/* Row 1: Region selector tabs */}
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedTypeChart('yours')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                selectedTypeChart === 'yours'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Yours
            </button>
            {REGIONAL_DEXES.map(dex => (
              <button
                key={dex.id}
                onClick={() => setSelectedTypeChart(dex.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                  selectedTypeChart === dex.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {dex.name}
              </button>
            ))}
            <button
              onClick={() => setSelectedTypeChart('national')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                selectedTypeChart === 'national'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              National
            </button>
          </div>

          {/* Row 2: Filters */}
          <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
            <button
              onClick={() => setExcludeSpecial(!excludeSpecial)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                excludeSpecial
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Exclude starters/legendaries
            </button>

            {selectedDex && !isNationalSelected && selectedDex.generation >= 2 && selectedDex.id !== 'unova' && (
              <div className="inline-flex rounded-full bg-muted overflow-hidden">
                <button
                  onClick={() => setNewPokemonOnly(true)}
                  className={`px-2.5 py-1 rounded-l-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                    newPokemonOnly
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Gen {selectedDex.generation} Only
                </button>
                <button
                  onClick={() => setNewPokemonOnly(false)}
                  className={`px-2.5 py-1 rounded-r-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                    !newPokemonOnly
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Regional Dex
                </button>
              </div>
            )}
          </div>

          <div className="bg-card rounded-lg border p-4">
            <ButterflyChart
              data={activeTypeChartData}
              hideDeviation={isNationalSelected}
              fixedMaxCount={unfilteredMaxCount}
              fixedDevRight={fixedDevRight}
            />
          </div>
        </section>

        {/* Generation Origin */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Generation Origin</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Where your Pokemon come from and deviation from national dex proportions.
          </p>
          <div className="bg-card rounded-lg border p-4">
            <ButterflyChart data={genChartData} rowHeight={28} />
          </div>
        </section>

        {/* Evolution Level Histogram */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Evolution Level Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Yours avg: {analytics.evolutionStats.avgLevel || 'N/A'}, National avg: {analytics.evolutionStats.nationalAvgLevel}.
          </p>
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-50" />
                <span className="text-[10px] text-muted-foreground font-medium">National Dex</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500 opacity-85" />
                <span className="text-[10px] text-muted-foreground font-medium">Yours</span>
              </div>
            </div>
            <SuperimposedHistogram
              data={evoHist.merged}
              binSize={evoHist.binSize}
              xDomain={evoHist.xDomain}
              xTicks={evoHist.xTicks}
              yDomain={evoHist.yDomain}
              yTicks={evoHist.yTicks}
            />
          </div>
        </section>

        {/* BST Histogram */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Base Stat Total Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Yours avg: {analytics.bstStats.avg}, National avg: {analytics.nationalAvgBst}.
          </p>
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-50" />
                <span className="text-[10px] text-muted-foreground font-medium">National Dex</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500 opacity-85" />
                <span className="text-[10px] text-muted-foreground font-medium">Yours</span>
              </div>
            </div>
            <SuperimposedHistogram
              data={bstHist.merged}
              binSize={bstHist.binSize}
              xDomain={bstHist.xDomain}
              xTicks={bstHist.xTicks}
              minorXTicks={bstHist.xTicks.slice(0, -1).map((t, i) => (t + bstHist.xTicks[i + 1]) / 2)}
              yDomain={bstHist.yDomain}
              yTicks={bstHist.yTicks}
            />
          </div>
        </section>

        {/* Evolution & Stage Stats — Mekko Chart */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Stage Distribution</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Evolution lines by stage count. Width = % of lines, height = pokemon count.
          </p>
          <div className="flex items-center gap-1.5 mb-3">
            <button
              onClick={() => setExcludeSpecialMekko(!excludeSpecialMekko)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                excludeSpecialMekko
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Exclude starters/legendaries
            </button>
          </div>
          <div className="bg-card rounded-lg border p-4">
            {mekkoData.totalLines > 0 ? (() => {
              const chartHeight = 180;
              const topMargin = 20;
              const gap = 8;
              const stageTotals: Record<number, number> = {};
              for (const col of mekkoData.columns) {
                for (const seg of col.segments) {
                  stageTotals[seg.stage] = (stageTotals[seg.stage] || 0) + seg.count;
                }
              }
              const stageNames = ['Single', 'Double', 'Triple'];
              const STAGE_LINE_COLORS = ['#e88a8a', '#d95050', '#b91c1c'];
              const totalPokemon = mekkoData.columns.reduce((sum, col) => sum + col.segments.reduce((s, seg) => s + seg.count, 0), 0);
              // Always render 3 columns for stable layout
              const allColumns = [1, 2, 3].map(len => {
                const existing = mekkoData.columns.find(c => c.lineLength === len);
                return existing || { lineLength: len, chainCount: 0, widthPct: 0, segments: [] as { stage: number; count: number }[] };
              });
              // Use the rightmost populated column for legend alignment
              const legendCol = allColumns[2].segments.length > 0 ? allColumns[2]
                : allColumns[1].segments.length > 0 ? allColumns[1]
                : allColumns[0];
              const legendColTotal = legendCol.segments.reduce((s, seg) => s + seg.count, 0);
              // Scale legend column height using fixedMaxColTotal for stable positioning
              const legendColHeight = fixedMaxColTotal > 0 ? (legendColTotal / fixedMaxColTotal) * chartHeight : 0;
              const legendColSegHeights = legendCol.segments.map(seg =>
                legendColTotal > 0 ? Math.max((seg.count / legendColTotal) * legendColHeight, seg.count > 0 ? 18 : 0) : 0
              );
              // Bottom offset for legend: space below the legend column
              const legendBottomOffset = chartHeight - legendColHeight;
              const legendStages = [3, 2, 1].filter(s => stageTotals[s]);
              const isFirstLegend = (s: number) => s === legendStages[0];
              return (
                <div className="flex">
                  {/* Columns + labels — fixed width */}
                  <div style={{ width: '70%' }}>
                    <div className="flex items-end" style={{ height: chartHeight + topMargin, gap }}>
                      {allColumns.map(col => {
                        const colTotal = col.segments.reduce((s, seg) => s + seg.count, 0);
                        const colHeight = fixedMaxColTotal > 0 ? (colTotal / fixedMaxColTotal) * chartHeight : 0;
                        const pokePct = totalPokemon > 0 ? ((colTotal / totalPokemon) * 100).toFixed(0) : '0';
                        return (
                          <div
                            key={col.lineLength}
                            className="flex-1 flex flex-col justify-end"
                            style={{ height: '100%' }}
                          >
                            {colTotal > 0 && (
                              <>
                                <div className="text-center text-[10px] text-muted-foreground font-semibold mb-0.5">
                                  {colTotal} ({pokePct}%)
                                </div>
                                <div className="flex flex-col-reverse">
                                  {col.segments.map(seg => {
                                    const segHeight = colTotal > 0
                                      ? (seg.count / colTotal) * colHeight
                                      : 0;
                                    return (
                                      <div
                                        key={seg.stage}
                                        className="flex items-center justify-center text-white text-[10px] font-semibold"
                                        style={{
                                          height: segHeight,
                                          backgroundColor: STAGE_COLORS[seg.stage - 1],
                                          minHeight: seg.count > 0 ? 18 : 0,
                                        }}
                                      >
                                        {seg.count > 0 && seg.count}
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* X-axis labels */}
                    <div className="flex mt-1" style={{ gap }}>
                      {allColumns.map((col, idx) => (
                        <div
                          key={col.lineLength}
                          className="flex-1 text-center text-[10px] text-muted-foreground leading-tight"
                        >
                          <span className="font-bold" style={{ color: STAGE_LINE_COLORS[col.lineLength - 1] }}>{stageNames[col.lineLength - 1]}-stage</span>
                          {idx === 0 ? <span className="font-bold"> lines</span> : ''}
                          <br />
                          <span className="font-bold">{col.chainCount}</span> (<span className="font-bold">{col.widthPct.toFixed(0)}%</span>)
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Inline legend — aligned with rightmost populated column's segments */}
                  <div className="flex flex-col-reverse shrink-0 pl-3" style={{ height: chartHeight + topMargin, paddingBottom: legendBottomOffset }}>
                    {legendCol.segments.map(seg => (
                      <div
                        key={seg.stage}
                        className="flex items-center text-[10px] whitespace-nowrap leading-tight"
                        style={{ height: legendColSegHeights[seg.stage - 1] }}
                      >
                        {seg.count > 0 && (
                          <span className="text-muted-foreground">
                            <span className="font-bold" style={{ color: STAGE_COLORS[seg.stage - 1] }}>Stage {seg.stage}</span>
                            {isFirstLegend(seg.stage) && <><br /><span className="font-bold">Pokémon</span></>}
                            <br />
                            <span className="font-bold">{stageTotals[seg.stage]}</span> (<span className="font-bold">{totalPokemon > 0 ? ((stageTotals[seg.stage] / totalPokemon) * 100).toFixed(0) : 0}%</span>)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })() : (
              <p className="text-sm text-muted-foreground text-center py-4">No evolution data yet</p>
            )}
          </div>
        </section>

        {/* Bottom breathing room with pokeball */}
        <div className="h-16 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" className="text-muted-foreground/20">
            <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="1" y1="12" x2="8.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
            <line x1="15.5" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  );
}

