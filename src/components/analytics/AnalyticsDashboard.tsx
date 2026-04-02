import React, { useMemo, useState } from 'react';
import { useAnalytics, fullBaseline, filteredBaseline } from '@/hooks/useAnalytics';
import { usePokedexStore, type DrillDownSegment } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { WhatsAdvisor } from './WhatsAdvisor';
import { ButterflyChart, type ButterflyRow } from './ButterflyChart';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import { getPokemonById, getAllPokemon, getEvolutionLine } from '@/hooks/usePokemonData';
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
  const drillDownSegment = usePokedexStore((s) => s.drillDownSegment);
  const openDrillDown = usePokedexStore((s) => s.openDrillDown);
  const closeDrillDown = usePokedexStore((s) => s.closeDrillDown);

  // Compute active labels for chart focus states
  const activeTypeLabel = drillDownSegment?.kind === 'type'
    ? drillDownSegment.type.charAt(0).toUpperCase() + drillDownSegment.type.slice(1) : null;
  const activeGenLabel = drillDownSegment?.kind === 'generation'
    ? `Gen ${drillDownSegment.generation}` : null;
  const activeEvoBin = drillDownSegment?.kind === 'evoLevel'
    ? drillDownSegment.binStart + (drillDownSegment.binEnd - drillDownSegment.binStart) / 2 : null;
  const activeBstBin = drillDownSegment?.kind === 'bst'
    ? drillDownSegment.binStart + (drillDownSegment.binEnd - drillDownSegment.binStart) / 2 : null;

  const handleDrillToggle = (segment: DrillDownSegment, siblings?: DrillDownSegment[], excludeFlag?: boolean) => {
    // If tapping same segment, close; otherwise open new
    if (drillDownSegment && drillDownSegment.kind === segment.kind &&
      JSON.stringify(drillDownSegment) === JSON.stringify(segment)) {
      closeDrillDown();
    } else {
      openDrillDown(segment, siblings, excludeFlag);
    }
  };

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

  // Compute sibling lists for swipe navigation
  const typeSiblings = useMemo((): DrillDownSegment[] =>
    typeChartData.filter(d => d.count > 0).map(d => ({ kind: 'type' as const, type: d.label.toLowerCase() })),
    [typeChartData]);
  const genSiblings = useMemo((): DrillDownSegment[] =>
    genChartData.filter(d => d.count > 0).map(d => ({ kind: 'generation' as const, generation: parseInt(d.label.replace('Gen ', '')) })),
    [genChartData]);

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

  const evoLevelSiblings = useMemo((): DrillDownSegment[] =>
    evoHist.merged.filter(d => d.yoursPct > 0).map(d => ({
      kind: 'evoLevel' as const,
      binStart: d.x - evoHist.binSize / 2,
      binEnd: d.x + evoHist.binSize / 2,
    })), [evoHist]);
  const bstSiblings = useMemo((): DrillDownSegment[] =>
    bstHist.merged.filter(d => d.yoursPct > 0).map(d => ({
      kind: 'bst' as const,
      binStart: d.x - bstHist.binSize / 2,
      binEnd: d.x + bstHist.binSize / 2,
    })), [bstHist]);

  // Compute fixed Y-axis max across both toggle states for stable chart
  const fixedMaxColTotal = useMemo(() => {
    const allIdSet = new Set(Object.values(sections).flat());
    const starterSectionIds = new Set(sections['starter'] ?? []);
    const allPokemon = [...allIdSet].map(id => getPokemonById(id)).filter(Boolean).map(p => p!);
    const filteredPokemon = allPokemon.filter(p => !p.isLegendary && !p.isMythical && !starterSectionIds.has(p.id));

    const getMaxCol = (pokemon: typeof allPokemon) => {
      const counts: Record<number, number> = {};
      for (const p of pokemon) {
        const lineLen = Math.min(getEvolutionLine(p.id).length, 3);
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

    // Count each of the user's pokemon once, grouped by branch length and stage
    // Use getEvolutionLine to determine each pokemon's specific branch length
    // (e.g. regular Zigzagoon→Linoone is 2-stage, only Galar branch is 3-stage)
    const stageCountsByLineLength: Record<number, Record<number, number>> = {};
    const chainsPerLength: Record<number, Set<string>> = {};

    for (const p of pokemon) {
      const line = getEvolutionLine(p.id);
      const lineLen = Math.min(line.length, 3);
      const stage = Math.min(p.evolutionStage, 3);
      // Use root pokemon ID as branch key (unique per branch, unlike evolutionChainId)
      const branchKey = `${line[0].id}`;

      if (!stageCountsByLineLength[lineLen]) stageCountsByLineLength[lineLen] = {};
      stageCountsByLineLength[lineLen][stage] = (stageCountsByLineLength[lineLen][stage] || 0) + 1;

      if (!chainsPerLength[lineLen]) chainsPerLength[lineLen] = new Set();
      chainsPerLength[lineLen].add(branchKey);
    }

    const allBranches = new Set(pokemon.map(p => `${getEvolutionLine(p.id)[0].id}`));
    const totalChains = allBranches.size;
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

      <div className="p-6 pb-0 space-y-8 max-w-6xl mx-auto">
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
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto py-1 border-x border-border px-2">
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
              onBarClick={selectedTypeChart === 'yours' ? (label) => handleDrillToggle({ kind: 'type', type: label.toLowerCase() }, typeSiblings, excludeSpecial) : undefined}
              activeLabel={selectedTypeChart === 'yours' ? activeTypeLabel : null}
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
            <ButterflyChart data={genChartData} rowHeight={28} onBarClick={(label) => {
              const gen = parseInt(label.replace('Gen ', ''));
              if (!isNaN(gen)) handleDrillToggle({ kind: 'generation', generation: gen }, genSiblings);
            }} activeLabel={activeGenLabel} />
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
              onBarClick={(binCenter) => {
                const binStart = binCenter - evoHist.binSize / 2;
                handleDrillToggle({ kind: 'evoLevel', binStart, binEnd: binStart + evoHist.binSize }, evoLevelSiblings);
              }}
              activeBin={activeEvoBin}
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
              onBarClick={(binCenter) => {
                const binStart = binCenter - bstHist.binSize / 2;
                handleDrillToggle({ kind: 'bst', binStart, binEnd: binStart + bstHist.binSize }, bstSiblings);
              }}
              activeBin={activeBstBin}
            />
          </div>
        </section>

        {/* Evolution & Stage Stats — Stacked Bar Chart */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Stage Distribution</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Pokémon grouped by evolution line length. Each bar shows the stage breakdown within that group.
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
              const MIN_SEG = 0;
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

              // Pre-compute actual segment heights for all columns (accounting for minHeight)
              const computeSegHeights = (segments: { stage: number; count: number }[]) => {
                const colTotal = segments.reduce((s, seg) => s + seg.count, 0);
                const colHeight = fixedMaxColTotal > 0 ? (colTotal / fixedMaxColTotal) * chartHeight : 0;
                return segments.map(seg => {
                  if (seg.count === 0) return 0;
                  const natural = colTotal > 0 ? (seg.count / colTotal) * colHeight : 0;
                  return Math.max(natural, MIN_SEG);
                });
              };
              const columnSegHeights = allColumns.map(col => computeSegHeights(col.segments));

              // Legend references rightmost populated column
              const legendIdx = allColumns[2].segments.length > 0 ? 2
                : allColumns[1].segments.length > 0 ? 1 : 0;
              const legendCol = allColumns[legendIdx];
              const legendSegHeights = columnSegHeights[legendIdx];

              const legendStages = [3, 2, 1].filter(s => stageTotals[s]);
              const isFirstLegend = (s: number) => s === legendStages[0];

              const containerH = chartHeight + topMargin;

              // Compute legend label positions with overlap resolution + leader lines
              const activeSegs = legendCol.segments
                .map((seg, idx) => ({ stage: seg.stage, count: seg.count, height: legendSegHeights[idx] }))
                .filter(s => s.count > 0);
              let legendYAccum = 0;
              const segCentersFromBottom = activeSegs.map(s => {
                const center = legendYAccum + s.height / 2;
                legendYAccum += s.height;
                return center;
              });
              const LEGEND_LABEL_H = 34;
              const LEGEND_LABEL_H_FIRST = 46; // first label has 3 lines (includes "Pokémon")
              const legendLabelHeights = activeSegs.map((seg) =>
                isFirstLegend(seg.stage) ? LEGEND_LABEL_H_FIRST : LEGEND_LABEL_H
              );
              const LEGEND_GAP = 4; // minimum visual gap between labels
              // Compute minimum center-to-center spacing for each adjacent pair
              const minSpacings = activeSegs.slice(1).map((_, i) =>
                (legendLabelHeights[i] + legendLabelHeights[i + 1]) / 2 + LEGEND_GAP
              );
              // Check if any natural positions overlap
              const labelCentersFromBottom = [...segCentersFromBottom];
              const needsRedistribution = minSpacings.some((minSp, i) =>
                segCentersFromBottom[i + 1] - segCentersFromBottom[i] < minSp
              );
              if (needsRedistribution && labelCentersFromBottom.length > 1) {
                // Total height needed for all labels with gaps
                const totalNeeded = legendLabelHeights.reduce((a, b) => a + b, 0) + LEGEND_GAP * (legendLabelHeights.length - 1);
                // Center the stack around the midpoint of original positions
                const origMid = (segCentersFromBottom[0] + segCentersFromBottom[segCentersFromBottom.length - 1]) / 2;
                let startCenter = origMid - totalNeeded / 2 + legendLabelHeights[0] / 2;
                // Don't let labels go below 0
                if (startCenter - legendLabelHeights[0] / 2 < 0) startCenter = legendLabelHeights[0] / 2;
                let acc = startCenter;
                for (let i = 0; i < labelCentersFromBottom.length; i++) {
                  labelCentersFromBottom[i] = acc;
                  if (i < labelCentersFromBottom.length - 1) {
                    acc += (legendLabelHeights[i] + legendLabelHeights[i + 1]) / 2 + LEGEND_GAP;
                  }
                }
              }
              const anyDisplaced = labelCentersFromBottom.some((y, i) =>
                Math.abs(y - segCentersFromBottom[i]) > 1
              );

              return (
                <div className="flex">
                  {/* Columns + labels — chart takes remaining space */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-end" style={{ height: containerH, gap }}>
                      {allColumns.map((col, colIdx) => {
                        const colTotal = col.segments.reduce((s, seg) => s + seg.count, 0);
                        const pokePct = totalPokemon > 0 ? ((colTotal / totalPokemon) * 100).toFixed(0) : '0';
                        const segHeights = columnSegHeights[colIdx];

                        // Think-cell style 2D label placement
                        // Priority: inside centered → best nearby candidate position
                        const LABEL_FONT = 10;
                        const LABEL_FIT = 14; // min segment height to fit label inside
                        const PILL_H = 12; // label pill height in px
                        // Build segment geometry (from bottom of stacked bar)
                        let yAcc = 0;
                        const segGeo = col.segments.map((seg, segIdx) => {
                          const h = segHeights[segIdx];
                          const center = yAcc + h / 2;
                          yAcc += h;
                          return { stage: seg.stage, count: seg.count, h, center };
                        }).filter(s => s.count > 0);
                        const colHeight = yAcc;

                        // Generate candidate positions for each label, ranked by priority.
                        const X_SLOTS = [50, 25, 75]; // center first, then left/right
                        const Y_NUDGES = [0, -8, 8, -16, 16]; // prefer no nudge

                        type Placed = { stage: number; count: number; xPct: number; y: number; inside: boolean };
                        const placedLabels: Placed[] = [];

                        // Check if a candidate overlaps any already-placed label
                        // X threshold must be less than slot spacing (35) to allow spreading
                        const overlapsPlaced = (xPct: number, y: number) =>
                          placedLabels.some(p =>
                            Math.abs(p.y - y) < PILL_H && Math.abs(p.xPct - xPct) < 20
                          );

                        for (const s of segGeo) {
                          // First choice: inside centered (if segment tall enough)
                          if (s.h >= LABEL_FIT && !overlapsPlaced(50, s.center)) {
                            placedLabels.push({ stage: s.stage, count: s.count, xPct: 50, y: s.center, inside: true });
                            continue;
                          }
                          // Try candidate positions: X slots × Y nudges, pick first non-overlapping
                          let placed = false;
                          for (const dy of Y_NUDGES) {
                            for (const xPct of X_SLOTS) {
                              const candY = s.center + dy;
                              if (!overlapsPlaced(xPct, candY)) {
                                placedLabels.push({ stage: s.stage, count: s.count, xPct, y: candY, inside: false });
                                placed = true;
                                break;
                              }
                            }
                            if (placed) break;
                          }
                          // Fallback: force place at center (shouldn't happen with 3 labels)
                          if (!placed) {
                            placedLabels.push({ stage: s.stage, count: s.count, xPct: 50, y: s.center, inside: false });
                          }
                        }

                        // Compute column-level highlight states
                        const isColumnActive = drillDownSegment?.kind === 'lineLength' &&
                          drillDownSegment.lineLength === col.lineLength;

                        return (
                          <div
                            key={col.lineLength}
                            className="flex-1 flex flex-col justify-end"
                            style={{ height: '100%' }}
                          >
                            {colTotal > 0 && (
                              <>
                                <div className="text-center text-[10px] text-muted-foreground font-bold mb-0.5 leading-tight flex items-end justify-center tabular-nums" style={{ height: 26 }}>
                                  <span>{colTotal} {colIdx === 0 && 'Pokémon '}<span className="font-normal">({pokePct}%)</span></span>
                                </div>
                                <div className="relative" style={{
                                  borderRadius: 3,
                                  boxShadow: isColumnActive ? `0 0 0 3.5px ${STAGE_LINE_COLORS[col.lineLength - 1]}ab` : undefined,
                                }}>
                                  <div className="flex flex-col-reverse" style={{ borderRadius: 3, overflow: 'hidden' }}>
                                    {col.segments.map((seg, segIdx) => {
                                      return (
                                        <div
                                          key={seg.stage}
                                          className={seg.count > 0 ? 'cursor-pointer hover:brightness-110 transition-[filter]' : ''}
                                          style={{
                                            height: segHeights[segIdx],
                                            backgroundColor: STAGE_COLORS[seg.stage - 1],
                                          }}
                                          onClick={seg.count > 0 ? () => handleDrillToggle({ kind: 'stage', lineLength: col.lineLength, stage: seg.stage }, undefined, excludeSpecialMekko) : undefined}
                                        />
                                      );
                                    })}
                                  </div>
                                  {/* Segment highlight overlay — positioned outside the clip container */}
                                  {(() => {
                                    // Find active segment and compute its position from bottom
                                    let activeStage: number | null = null;
                                    for (const seg of col.segments) {
                                      const isSeg = drillDownSegment?.kind === 'stage' &&
                                        drillDownSegment.lineLength === col.lineLength &&
                                        drillDownSegment.stage === seg.stage;
                                      const isAll = drillDownSegment?.kind === 'stageAll' &&
                                        drillDownSegment.stage === seg.stage;
                                      if ((isSeg || isAll) && seg.count > 0) { activeStage = seg.stage; break; }
                                    }
                                    if (activeStage === null) return null;
                                    // Compute bottom offset and height (segments indexed 0=stage1 at bottom)
                                    let bottom = 0;
                                    let height = 0;
                                    for (let i = 0; i < col.segments.length; i++) {
                                      const h = segHeights[i];
                                      if (col.segments[i].stage === activeStage) { height = h; break; }
                                      bottom += h;
                                    }
                                    return (
                                      <div
                                        className="absolute inset-x-0 pointer-events-none"
                                        style={{
                                          bottom,
                                          height,
                                          boxShadow: `0 0 0 3.5px ${STAGE_COLORS[activeStage - 1]}ab`,
                                          borderRadius: 2,
                                          zIndex: 5,
                                        }}
                                      />
                                    );
                                  })()}
                                  {/* Label overlay */}
                                  <svg
                                    className="absolute top-0 left-0 overflow-visible pointer-events-none"
                                    style={{ width: '100%', height: colHeight || 1 }}
                                  >
                                    {placedLabels.map(label => {
                                      const labelY = colHeight - label.y;
                                      if (label.inside) {
                                        return (
                                          <text
                                            key={label.stage}
                                            x={`${label.xPct}%`} y={labelY}
                                            textAnchor="middle" dominantBaseline="central"
                                            fill="white" fontSize={LABEL_FONT} fontWeight={600}
                                          >
                                            {label.count}
                                          </text>
                                        );
                                      }
                                      // Displaced: background pill in segment color
                                      const bgColor = STAGE_COLORS[label.stage - 1];
                                      const pillW = String(label.count).length * 7 + 6;
                                      return (
                                        <g key={label.stage}>
                                          <rect
                                            x={`calc(${label.xPct}% - ${pillW / 2}px)`}
                                            y={labelY - 6}
                                            width={pillW} height={12}
                                            rx={3}
                                            fill={bgColor}
                                          />
                                          <text
                                            x={`${label.xPct}%`} y={labelY}
                                            textAnchor="middle" dominantBaseline="central"
                                            fill="white" fontSize={LABEL_FONT} fontWeight={600}
                                          >
                                            {label.count}
                                          </text>
                                        </g>
                                      );
                                    })}
                                  </svg>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* X-axis labels — click to drill into all of that line length */}
                    <div className="flex mt-1" style={{ gap }}>
                      {allColumns.map((col, idx) => {
                        const isXActive = drillDownSegment?.kind === 'lineLength' && drillDownSegment.lineLength === col.lineLength;
                        return (
                          <div
                            key={col.lineLength}
                            className="flex-1 text-center text-[10px] text-muted-foreground font-bold leading-tight tabular-nums cursor-pointer"
                            style={{ height: 38, textDecoration: isXActive ? 'underline' : undefined, textDecorationColor: isXActive ? STAGE_LINE_COLORS[col.lineLength - 1] : undefined }}
                            onClick={() => col.chainCount > 0 && handleDrillToggle({ kind: 'lineLength', lineLength: col.lineLength }, undefined, excludeSpecialMekko)}
                          >
                            <span style={{ color: STAGE_LINE_COLORS[col.lineLength - 1] }}>{stageNames[col.lineLength - 1]}-stage</span>
                            <br />
                            {col.chainCount}{idx === 0 && ' lines'} <span className="font-normal">({col.widthPct.toFixed(0)}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Inline legend — with leader lines when labels would overlap */}
                  <div className="relative shrink-0" style={{ height: containerH, marginLeft: 12, width: 68 }}>
                    {/* SVG leader lines (only when labels are displaced) */}
                    {anyDisplaced && (
                      <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ width: 16, height: containerH }}>
                        {activeSegs.map((seg, i) => {
                          const segY = containerH - segCentersFromBottom[i];
                          const labelY = containerH - labelCentersFromBottom[i];
                          return (
                            <path
                              key={seg.stage}
                              d={`M0,${segY} C8,${segY} 8,${labelY} 16,${labelY}`}
                              fill="none"
                              stroke={STAGE_COLORS[seg.stage - 1]}
                              strokeWidth={1.5}
                              opacity={0.5}
                            />
                          );
                        })}
                      </svg>
                    )}
                    {/* Labels — absolutely positioned, clickable to drill into all of that stage */}
                    {activeSegs.map((seg, i) => {
                      const bottomPos = labelCentersFromBottom[i] - legendLabelHeights[i] / 2;
                      const isLegendActive = drillDownSegment?.kind === 'stageAll' && drillDownSegment.stage === seg.stage;
                      return (
                        <div
                          key={seg.stage}
                          className="absolute text-[10px] whitespace-nowrap leading-tight flex items-center tabular-nums cursor-pointer"
                          style={{
                            bottom: bottomPos,
                            height: legendLabelHeights[i],
                            left: anyDisplaced ? 18 : 0,
                          }}
                          onClick={() => handleDrillToggle({ kind: 'stageAll', stage: seg.stage }, undefined, excludeSpecialMekko)}
                        >
                          <span className="text-muted-foreground font-bold" style={isLegendActive ? { textDecoration: 'underline', textDecorationColor: STAGE_COLORS[seg.stage - 1] } : undefined}>
                            <span style={{ color: STAGE_COLORS[seg.stage - 1] }}>Stage {seg.stage}</span>
                            {isFirstLegend(seg.stage) && <><br />Pokémon</>}
                            <br />
                            {stageTotals[seg.stage]} <span className="font-normal">({totalPokemon > 0 ? ((stageTotals[seg.stage] / totalPokemon) * 100).toFixed(0) : 0}%)</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })() : (
              <p className="text-sm text-muted-foreground text-center py-4">No evolution data yet</p>
            )}
          </div>
        </section>

      </div>
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
  );
}

