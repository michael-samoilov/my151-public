import React, { useEffect, useMemo, useState } from 'react';
import { useAnalytics, fullBaseline, filteredBaseline } from '@/hooks/useAnalytics';
import { usePokedexStore, type DrillDownSegment } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { WhatsAdvisor } from './WhatsAdvisor';
import { ButterflyChart } from './ButterflyChart';
import { rowKey, type ButterflyRow } from './butterflyRow';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import { getPokemonById, getPokemonByIds, getAllPokemon, withoutSpecials } from '@/hooks/usePokemonData';
import { TYPE_NAMES, type TypeName, type Pokemon } from '@/types/pokemon';
import { countTypes, buildTypeRows } from './typeDistribution';
import { STARTER_IDS } from '@/data/categories';
import { typeIconPath } from '@/data/type-ids';
import { SuperimposedHistogram } from './SuperimposedHistogram';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { SHAPE_ORDER, shapeChartIcon, SHAPE_ICON_SCALE } from '@/components/shared/ShapeIcon';
import { regionName, shapeLabel, t, typeLabel } from '@/i18n';
import { computeTypeDominance, getNationalBaseline, getNationalBaselineFiltered } from '@/hooks/useTypeDominance';
import { PageFooter } from '@/components/shared/PageFooter';
import { StageDistributionChart } from './StageDistributionChart';
import { MilestoneBar } from '@/components/pokedex/MilestoneBar';

// The gen and shape charts use a single app-red bar (no per-category colors);
// the gen badge and shape silhouette carry the identity in the icon column.
const CHART_BAR_RED = '#ef4444';


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
  const [selectedTypeChart, setSelectedTypeChart] = useState<string>('yours');
  const [newPokemonOnly, setNewPokemonOnly] = useState(true);
  const [typeView, setTypeView] = useState<'distribution' | 'matchup'>('distribution');
  const [typeSortBy, setTypeSortBy] = useState<'count' | 'deviation' | 'label'>('deviation');
  const [genSortBy, setGenSortBy] = useState<'count' | 'deviation' | 'label'>('label');
  const [shapeSortBy, setShapeSortBy] = useState<'count' | 'deviation' | 'label'>('count');

  const analytics = useAnalytics();
  const sections = usePokedexStore((s) => s.sections);
  const drillDownSegment = usePokedexStore((s) => s.drillDownSegment);
  const drillDownDexId = usePokedexStore((s) => s.drillDownDexId);
  const openDrillDown = usePokedexStore((s) => s.openDrillDown);
  const closeDrillDown = usePokedexStore((s) => s.closeDrillDown);

  // Compute active labels for chart focus states
  // activeTypeLabel only highlights when drilldown dex context matches the displayed chart
  const drillDownIsYours = drillDownDexId === null;
  const activeTypeKey = drillDownSegment?.kind === 'type' ? drillDownSegment.type : null;
  const activeGenKey = drillDownSegment?.kind === 'generation' ? String(drillDownSegment.generation) : null;
  const activeShapeKey = drillDownSegment?.kind === 'shape' ? drillDownSegment.shape : null;
  const activeEvoBin = drillDownSegment?.kind === 'evoLevel'
    ? drillDownSegment.binStart + (drillDownSegment.binEnd - drillDownSegment.binStart) / 2 : null;
  const activeBstBin = drillDownSegment?.kind === 'bst'
    ? drillDownSegment.binStart + (drillDownSegment.binEnd - drillDownSegment.binStart) / 2 : null;

  const handleDrillToggle = (segment: DrillDownSegment, siblings?: DrillDownSegment[], excludeFlag?: boolean, dexId?: string | null, newOnly?: boolean) => {
    // If tapping same segment with same dex context, close; otherwise open new
    const sameDex = (dexId ?? null) === drillDownDexId;
    if (sameDex && drillDownSegment && drillDownSegment.kind === segment.kind &&
      JSON.stringify(drillDownSegment) === JSON.stringify(segment)) {
      closeDrillDown();
    } else {
      openDrillDown(segment, siblings, excludeFlag, dexId, newOnly);
    }
  };

  // "Yours" type chart — computed locally so excludeSpecial only affects this chart.
  // Returns the row data plus the pokemon count, which the chart needs as the
  // percentage-label denominator — a dual-type pokemon contributes to two bars,
  // so summing the bar counts would overcount the "dex size" the label refers to.
  const typeChart = useMemo<{ rows: ButterflyRow[]; total: number }>(() => {
    const base = excludeSpecial ? filteredBaseline : fullBaseline;
    const allIds = Object.values(sections).flat();
    const starterSectionIds = new Set(sections['starter'] ?? []);
    let pokemon = getPokemonByIds(allIds);
    if (excludeSpecial) {
      pokemon = withoutSpecials(pokemon, starterSectionIds);
    }
    const total = pokemon.length;
    if (total === 0) return { rows: [], total: 0 };

    const rows = buildTypeRows(countTypes(pokemon), total, base.typeProp)
      .sort((a, b) => b.deviation - a.deviation);
    return { rows, total };
  }, [sections, excludeSpecial]);
  const typeChartData = typeChart.rows;

  const genChartData: ButterflyRow[] = useMemo(() =>
    analytics.generationDeviation.map((d) => {
      const gen = d.generation;
      const stops = GEN_STOPS[gen] ?? [{ offset: '100%', color: '#888' }];
      return {
        key: String(gen),
        label: t('browser.genChip', { gen }),
        count: d.count,
        deviation: d.deviation,
        color: CHART_BAR_RED,
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

  // Body-shape distribution vs the national dex (same over/under-index
  // treatment as type/gen). Baseline = base-dex species (id ≤ 1025); your
  // side counts every placed member by its official shape group.
  const shapeChartData: ButterflyRow[] = useMemo(() => {
    const yours = getPokemonByIds(Object.values(sections).flat());
    const yoursFiltered = excludeSpecial ? withoutSpecials(yours) : yours;
    const nationalAll = getAllPokemon().filter((p) => p.id <= 1025);
    const national = excludeSpecial ? withoutSpecials(nationalAll) : nationalAll;
    const natCounts = new Map<string, number>();
    for (const p of national) natCounts.set(p.shape, (natCounts.get(p.shape) ?? 0) + 1);
    const yourCounts = new Map<string, number>();
    for (const p of yoursFiltered) yourCounts.set(p.shape, (yourCounts.get(p.shape) ?? 0) + 1);
    const yourTotal = yoursFiltered.length || 1;
    return SHAPE_ORDER.map((shape) => {
      const count = yourCounts.get(shape) ?? 0;
      const natShare = (natCounts.get(shape) ?? 0) / national.length;
      const yourShare = count / yourTotal;
      return {
        key: shape,
        label: shapeLabel(shape),
        count,
        deviation: natShare > 0 ? (yourShare / natShare - 1) * 100 : 0,
        color: CHART_BAR_RED,
        icon: shapeChartIcon(shape),
      };
    });
  }, [sections, excludeSpecial]);

  // Compute sibling lists for swipe navigation
  const typeSiblings = useMemo((): DrillDownSegment[] =>
    typeChartData.filter(d => d.count > 0).map(d => ({ kind: 'type' as const, type: rowKey(d) })),
    [typeChartData]);
  const genSiblings = useMemo((): DrillDownSegment[] =>
    genChartData.filter(d => d.count > 0).map(d => ({ kind: 'generation' as const, generation: Number(rowKey(d)) })),
    [genChartData]);
  const shapeSiblings = useMemo((): DrillDownSegment[] =>
    shapeChartData.filter(d => d.count > 0).map(d => ({ kind: 'shape' as const, shape: rowKey(d) })),
    [shapeChartData]);

  // Compute type chart data for a regional/national dex (also returns the
  // pokemon count for the chart's percentage-label denominator).
  const regionalTypeChart = useMemo<{ rows: ButterflyRow[]; total: number }>(() => {
    if (selectedTypeChart === 'yours') return { rows: [], total: 0 };
    const dex = REGIONAL_DEXES.find(d => d.id === selectedTypeChart);
    const isNational = selectedTypeChart === 'national';
    if (!dex && !isNational) return { rows: [], total: 0 };

    const base = excludeSpecial ? filteredBaseline : fullBaseline;
    let pokemon = isNational
      ? getAllPokemon()
      : getPokemonByIds(dex!.pokemonIds);
    if (excludeSpecial) {
      pokemon = withoutSpecials(pokemon, STARTER_IDS);
    }
    if (newPokemonOnly && dex) {
      pokemon = pokemon.filter(p => p.generation === dex.generation);
    }
    const total = pokemon.length;
    if (total === 0) return { rows: [], total: 0 };

    const rows = buildTypeRows(countTypes(pokemon), total, base.typeProp)
      .sort(isNational
        ? (a, b) => b.count - a.count
        : (a, b) => b.deviation - a.deviation);
    return { rows, total };
  }, [selectedTypeChart, excludeSpecial, newPokemonOnly]);
  const regionalTypeChartData = regionalTypeChart.rows;

  const regionalTypeSiblings = useMemo((): DrillDownSegment[] =>
    regionalTypeChartData.filter(d => d.count > 0).map(d => ({ kind: 'type' as const, type: rowKey(d) })),
    [regionalTypeChartData]);

  const activeTypeChartData = selectedTypeChart === 'yours' ? typeChartData : regionalTypeChartData;
  const activeTypeChartTotal = selectedTypeChart === 'yours' ? typeChart.total : regionalTypeChart.total;
  const isNationalSelected = selectedTypeChart === 'national';
  const selectedDex = REGIONAL_DEXES.find(d => d.id === selectedTypeChart);

  // Type matchup strength: per-type average advantage score + deviation from national
  const typeMatchupData: ButterflyRow[] = useMemo(() => {
    let pokemon;
    if (selectedTypeChart === 'yours') {
      const allIds = Object.values(sections).flat();
      const starterSectionIds = new Set(sections['starter'] ?? []);
      pokemon = getPokemonByIds(allIds);
      if (excludeSpecial) {
        pokemon = withoutSpecials(pokemon, starterSectionIds);
      }
    } else if (selectedTypeChart === 'national') {
      pokemon = getAllPokemon();
      if (excludeSpecial) {
        pokemon = withoutSpecials(pokemon, STARTER_IDS);
      }
    } else {
      const dex = REGIONAL_DEXES.find(d => d.id === selectedTypeChart);
      if (!dex) return [];
      pokemon = getPokemonByIds(dex.pokemonIds);
      if (newPokemonOnly) {
        pokemon = pokemon.filter(p => p.generation === dex.generation);
      }
      if (excludeSpecial) {
        pokemon = withoutSpecials(pokemon, STARTER_IDS);
      }
    }
    if (pokemon.length === 0) return [];

    const baseline = excludeSpecial
      ? getNationalBaselineFiltered(STARTER_IDS)
      : getNationalBaseline();
    const results = computeTypeDominance(pokemon);

    return results.map(r => ({
      key: r.type,
      label: typeLabel(r.type as TypeName),
      count: r.score,
      deviation: r.score - (baseline.get(r.type) ?? 0),
      color: TYPE_COLORS[r.type as keyof typeof TYPE_COLORS],
      icon: typeIconPath(r.type as TypeName),
    })).sort((a, b) => isNationalSelected ? b.count - a.count : b.deviation - a.deviation);
  }, [sections, selectedTypeChart, excludeSpecial, newPokemonOnly, isNationalSelected]);

  // Check if any permutation of the matchup chart has both neg AND pos scores (bidirectional)
  // so layout stays stable when toggling filters
  const matchupForceBidirectional = useMemo(() => {
    const checkBidi = (pokemon: NonNullable<ReturnType<typeof getPokemonById>>[]) => {
      if (pokemon.length === 0) return false;
      const results = computeTypeDominance(pokemon);
      return results.some(r => r.score < 0) && results.some(r => r.score > 0);
    };
    const permutations = (sets: NonNullable<ReturnType<typeof getPokemonById>>[][]) =>
      sets.some(s => checkBidi(s)) || sets.some(s => checkBidi(withoutSpecials(s, STARTER_IDS)));
    if (selectedTypeChart === 'yours') {
      const allIds = Object.values(sections).flat();
      const allPokemon = getPokemonByIds(allIds);
      const starterIds = new Set(sections['starter'] ?? []);
      const filtered = withoutSpecials(allPokemon, starterIds);
      return checkBidi(allPokemon) || checkBidi(filtered);
    }
    if (isNationalSelected) {
      return permutations([getAllPokemon()]);
    }
    const dex = REGIONAL_DEXES.find(d => d.id === selectedTypeChart);
    if (!dex) return false;
    const allInDex = getPokemonByIds(dex.pokemonIds);
    const genOnly = allInDex.filter(p => p.generation === dex.generation);
    return permutations([allInDex, genOnly]);
  }, [selectedTypeChart, isNationalSelected, sections]);

  // Type matchup siblings for drill-down navigation
  const typeMatchupSiblings = useMemo((): DrillDownSegment[] =>
    typeMatchupData.map(d => ({ kind: 'typeMatchup' as const, type: rowKey(d) })),
    [typeMatchupData]);

  const activeMatchupKey = drillDownSegment?.kind === 'typeMatchup' ? drillDownSegment.type : null;

  // Sync drilldown filters when analytics filter chips change while a drilldown is open
  useEffect(() => {
    if (!drillDownSegment) return;
    const kind = drillDownSegment.kind;
    if (kind === 'type' || kind === 'typeMatchup') {
      const dexId = selectedTypeChart === 'yours' ? null : selectedTypeChart;
      const siblings = kind === 'typeMatchup'
        ? typeMatchupSiblings
        : (selectedTypeChart === 'yours' ? typeSiblings : regionalTypeSiblings);
      openDrillDown(drillDownSegment, siblings, excludeSpecial, dexId, newPokemonOnly);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludeSpecial, selectedTypeChart, newPokemonOnly]);

  // Fixed axis extents — max across all toggle permutations (exclusion × gen-only/regional)
  // so toggling filters only shrinks bars, never shifts axes
  const { fixedMaxCount: unfilteredMaxCount, fixedDevRight } = useMemo(() => {
    const computeDevRight = (deviations: number[]) => {
      return Math.max(...deviations, 50);
    };
    const computeTypeStats = (pokemon: Pokemon[], base: typeof fullBaseline) => {
      const total = pokemon.length;
      if (total === 0) return { maxCount: 1, devRight: 50 };
      const typeCounts = countTypes(pokemon);
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
      const allPokemon = getPokemonByIds(allIds);
      const starterIds = new Set(sections['starter'] ?? []);
      const filteredPokemon = withoutSpecials(allPokemon, starterIds);
      const s1 = computeTypeStats(allPokemon, fullBaseline);
      const s2 = computeTypeStats(filteredPokemon, filteredBaseline);
      return {
        fixedMaxCount: Math.max(s1.maxCount, s2.maxCount),
        fixedDevRight: Math.max(s1.devRight, s2.devRight),
      };
    }

    if (isNationalSelected) {
      const allPokemon = getAllPokemon();
      const filteredPokemon = withoutSpecials(allPokemon, STARTER_IDS);
      const s1 = computeTypeStats(allPokemon, fullBaseline);
      const s2 = computeTypeStats(filteredPokemon, filteredBaseline);
      return {
        fixedMaxCount: Math.max(s1.maxCount, s2.maxCount),
        fixedDevRight: undefined,
      };
    }

    const dex = REGIONAL_DEXES.find(d => d.id === selectedTypeChart);
    if (!dex) return { fixedMaxCount: undefined, fixedDevRight: undefined };

    // Only share axis extent across exclusion on/off for the *current* gen toggle
    const allInDex = getPokemonByIds(dex.pokemonIds);
    const base = newPokemonOnly ? allInDex.filter(p => p.generation === dex.generation) : allInDex;
    const unfiltered = computeTypeStats(base, fullBaseline);
    const filtered = computeTypeStats(
      withoutSpecials(base, STARTER_IDS),
      filteredBaseline,
    );
    return {
      fixedMaxCount: Math.max(unfiltered.maxCount, filtered.maxCount),
      fixedDevRight: Math.max(unfiltered.devRight, filtered.devRight),
    };
  }, [selectedTypeChart, isNationalSelected, newPokemonOnly, sections]);

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

  if (analytics.total === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-muted-foreground">No Pokémon assigned yet</p>
          <p className="text-sm text-muted-foreground">
            {t('analytics.empty')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header — outside scroll container, matches build/view pages */}
      <div className="flex items-center px-3 sm:px-6 py-2 border-b h-11 shrink-0">
        <div className="shrink-0" style={{ width: 'var(--ms-side)' }}>
          <h2 className="text-2xl font-extrabold tracking-tight leading-none tabular-nums">
            <span className="text-primary">{analytics.total}</span>
            <span className="text-foreground">/151</span>
          </h2>
        </div>
        <div className="flex-1 min-w-0">
          <MilestoneBar />
        </div>
        {/* Empty slot mirrors the counter's reserved width so the right divider
            sits at the same inset as the left, even with no controls here. */}
        <div className="shrink-0" style={{ width: 'var(--ms-side)' }} aria-hidden />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain md:overscroll-auto">
      <div className="p-6 pb-0 space-y-8 max-w-6xl md:max-w-2xl mx-auto">
        {/* What's Missing Advisor — moved to top */}
        <section className="bg-card rounded-lg shadow-elevated overflow-hidden">
          <WhatsAdvisor />
        </section>

        {/* Type Analysis — tabbed: Distribution / Matchup */}
        <section>
          <h3 className="text-lg font-semibold mb-1">{t('analytics.type.heading')}</h3>

          <div className="space-y-1.5 mb-3">
          {/* Region selector tabs — matches build page filter chip styling */}
          <div className="flex items-stretch border-x border-border">
            {/* Fixed left (outside scroll container): National + Yours */}
            <div className="shrink-0 self-stretch flex items-center gap-1.5 bg-background border-r border-border pl-2 pr-2 py-1">
              <button type="button"
                onClick={() => setSelectedTypeChart('national')}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedTypeChart === 'national'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('analytics.dex.nationalShort')}
              </button>
              <button type="button"
                onClick={() => setSelectedTypeChart('yours')}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedTypeChart === 'yours'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('analytics.dex.yours')}
              </button>
            </div>
            {/* Scrollable: regional dexes */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar items-center min-w-0 pl-2 pr-2 py-1">
              {REGIONAL_DEXES.map(dex => (
                <button type="button"
                  key={dex.id}
                  onClick={() => setSelectedTypeChart(dex.id)}
                  className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedTypeChart === dex.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {regionName(dex.id)}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button type="button"
              onClick={() => setExcludeSpecial(!excludeSpecial)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                excludeSpecial
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {t('analytics.excludeSpecial')}
            </button>

            {selectedDex && !isNationalSelected && selectedDex.generation >= 2 && selectedDex.id !== 'unova' && (
              <div className="inline-flex rounded-full bg-muted overflow-hidden">
                <button type="button"
                  onClick={() => setNewPokemonOnly(true)}
                  className={`px-1.5 py-0.5 rounded-l-full text-xs font-medium whitespace-nowrap transition-colors ${
                    newPokemonOnly
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Gen {selectedDex.generation} only
                </button>
                <button type="button"
                  onClick={() => setNewPokemonOnly(false)}
                  className={`px-1.5 py-0.5 rounded-r-full text-xs font-medium whitespace-nowrap transition-colors ${
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
          </div>

          <div className="bg-card rounded-lg shadow-elevated overflow-hidden">
            {/* Tab headers — inside card. Selected tab is filled primary
                with white text. An explicit primary-colored strip below the
                tab row visually connects the selected tab into a horizontal
                bar spanning the full container width, so the tab reads as
                merging into the divider between tabs and content. */}
            <div className="flex">
              <button type="button"
                onClick={() => setTypeView('distribution')}
                className={`flex-1 text-center px-3 py-1.5 text-sm font-semibold transition-colors ${
                  typeView === 'distribution'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('analytics.typeView.distribution')}
              </button>
              <button type="button"
                onClick={() => setTypeView('matchup')}
                className={`flex-1 text-center px-3 py-1.5 text-sm font-semibold transition-colors ${
                  typeView === 'matchup'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('analytics.typeView.matchups')}
              </button>
            </div>
            <div className="h-[3px] bg-primary" />
            <div className="py-2 md:py-4">
            <p className="text-sm text-muted-foreground mb-3 md:mb-4 px-3 min-h-[4.125rem] md:min-h-[2.75rem]">
              {typeView === 'distribution'
                ? t('analytics.type.descDistribution')
                : t('analytics.type.descMatchup')}
            </p>
            <div className="px-6">
            {typeView === 'distribution' ? (
              <ButterflyChart
                data={[...activeTypeChartData].sort((a, b) =>
                  typeSortBy === 'deviation' ? b.deviation - a.deviation
                    : typeSortBy === 'label' ? a.label.localeCompare(b.label)
                    : b.count - a.count
                )}
                rowHeight={16}
                hideDeviation={isNationalSelected}
                fixedMaxCount={unfilteredMaxCount}
                fixedDevRight={fixedDevRight}
                sortBy={typeSortBy}
                onSortChange={setTypeSortBy}
                labelHeader={t('chart.header.type')}
                disableEmptyRows
                // Types overlap (dual-types contribute to two bars), so the
                // default "share of type mentions" denominator would dilute
                // every percentage. Pass the pokemon count so each bar reads
                // as "share of the dex".
                countDenominator={isNationalSelected ? activeTypeChartTotal : undefined}
                onBarClick={(type) => {
                  if (selectedTypeChart === 'yours') {
                    handleDrillToggle({ kind: 'type', type }, typeSiblings, excludeSpecial);
                  } else {
                    handleDrillToggle(
                      { kind: 'type', type },
                      regionalTypeSiblings,
                      excludeSpecial,
                      selectedTypeChart,
                      newPokemonOnly,
                    );
                  }
                }}
                activeKey={
                  (selectedTypeChart === 'yours' && drillDownIsYours) ||
                  (selectedTypeChart !== 'yours' && drillDownDexId === selectedTypeChart)
                    ? activeTypeKey : null
                }
              />
            ) : typeMatchupData.length > 0 ? (
              <ButterflyChart
                data={[...typeMatchupData].sort((a, b) =>
                  typeSortBy === 'deviation' ? b.deviation - a.deviation
                    : typeSortBy === 'label' ? a.label.localeCompare(b.label)
                    : b.count - a.count
                )}
                rowHeight={16}
                scoreMode
                hideDeviation={isNationalSelected}
                forceBidirectionalCount={matchupForceBidirectional}
                sortBy={typeSortBy}
                onSortChange={setTypeSortBy}
                labelHeader={t('chart.header.type')}
                onBarClick={(type) => {
                  if (selectedTypeChart === 'yours') {
                    handleDrillToggle(
                      { kind: 'typeMatchup', type },
                      typeMatchupSiblings,
                      excludeSpecial,
                    );
                  } else {
                    handleDrillToggle(
                      { kind: 'typeMatchup', type },
                      typeMatchupSiblings,
                      excludeSpecial,
                      selectedTypeChart,
                      newPokemonOnly,
                    );
                  }
                }}
                activeKey={drillDownSegment?.kind === 'typeMatchup' ? activeMatchupKey : null}
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('analytics.noMatchup')}</p>
            )}
            </div>
            </div>
          </div>
        </section>

        {/* Generation Origin */}
        <section>
          <h3 className="text-lg font-semibold mb-1">{t('analytics.gen.heading')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('analytics.gen.desc')}
          </p>
          <div className="bg-card rounded-lg shadow-elevated p-4">
            <ButterflyChart
              data={[...genChartData].sort((a, b) =>
                genSortBy === 'deviation' ? b.deviation - a.deviation
                  : genSortBy === 'count' ? b.count - a.count
                  : Number(rowKey(a)) - Number(rowKey(b))
              )}
              rowHeight={28}
              disableEmptyRows
              sortBy={genSortBy}
              onSortChange={setGenSortBy}
              labelHeader={t('chart.header.gen')}
              labelSortable
              onBarClick={(key) => {
                const generation = Number(key);
                if (!isNaN(generation)) handleDrillToggle({ kind: 'generation', generation }, genSiblings);
              }}
              activeKey={activeGenKey}
            />
          </div>
        </section>

        {/* Body Shape Distribution */}
        <section>
          <h3 className="text-lg font-semibold mb-1">{t('analytics.shape.heading')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('analytics.shape.desc')}
          </p>
          <div className="bg-card rounded-lg shadow-elevated p-4">
            <ButterflyChart
              data={[...shapeChartData].sort((a, b) =>
                shapeSortBy === 'deviation' ? b.deviation - a.deviation
                  : shapeSortBy === 'count' ? b.count - a.count
                  : a.label.localeCompare(b.label)
              )}
              rowHeight={22}
              disableEmptyRows
              sortBy={shapeSortBy}
              onSortChange={setShapeSortBy}
              labelHeader={t('chart.header.shape')}
              labelWidthBase={80}
              iconScale={SHAPE_ICON_SCALE}
              onBarClick={(shape) => handleDrillToggle({ kind: 'shape', shape }, shapeSiblings)}
              activeKey={activeShapeKey}
            />
          </div>
        </section>

        {/* Evolution Level Histogram */}
        <section>
          <h3 className="text-lg font-semibold mb-1">{t('analytics.evoLevel.heading')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('analytics.avgCompare', { yours: analytics.evolutionStats.avgLevel || 'N/A', national: analytics.evolutionStats.nationalAvgLevel })}
          </p>
          <div className="bg-card rounded-lg shadow-elevated p-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-50" />
                <span className="text-xs text-muted-foreground font-medium">{t('analytics.dex.national')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500 opacity-85" />
                <span className="text-xs text-muted-foreground font-medium">{t('analytics.dex.yours')}</span>
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
          <h3 className="text-lg font-semibold mb-1">{t('analytics.bst.heading')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('analytics.avgCompare', { yours: analytics.bstStats.avg, national: analytics.nationalAvgBst })}
          </p>
          <div className="bg-card rounded-lg shadow-elevated p-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-50" />
                <span className="text-xs text-muted-foreground font-medium">{t('analytics.dex.national')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500 opacity-85" />
                <span className="text-xs text-muted-foreground font-medium">{t('analytics.dex.yours')}</span>
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

        {/* Stage Distribution — mekko chart, self-contained component */}
        <StageDistributionChart
          sections={sections}
          drillDownSegment={drillDownSegment}
          onDrillToggle={handleDrillToggle}
        />

      </div>
      <PageFooter />
      </div>
    </div>
  );
}

