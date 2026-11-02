import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useAnalytics, fullBaseline, filteredBaseline } from '@/hooks/useAnalytics';
import { usePokedexStore, type DrillDownSegment } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { WhatsAdvisor } from './WhatsAdvisor';
import { ButterflyChart } from './ButterflyChart';
import { CHART_BAR_RED, rowKey, type ButterflyRow } from './butterflyRow';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import { getPokemonById, getPokemonByIds, getAllPokemon, withoutSpecials } from '@/hooks/usePokemonData';
import { TYPE_NAMES, type TypeName, type Pokemon } from '@/types/pokemon';
import { countTypes, buildTypeRows } from './typeDistribution';
import { STARTER_IDS } from '@/data/categories';
import { typeChartIcon } from '@/components/shared/typeBadgeSvg';
import { generationChartIcon, shapeBadgeChartIcon } from '@/components/shared/attributeBadgeSvg';
import type { GenNumber } from '@/favorites/model/cells';
import { SuperimposedHistogram } from './SuperimposedHistogram';
import { SHAPE_ORDER } from '@/components/shared/ShapeIcon';
import { regionName, shapeLabel, typeLabel, useT } from '@/i18n';
import { computeTypeDominance, getNationalBaseline, getNationalBaselineFiltered } from '@/hooks/useTypeDominance';
import { PageFooter } from '@/components/shared/PageFooter';
import { EmptyState } from '@/components/shared/EmptyState';
import { StageDistributionChart } from './StageDistributionChart';
import { ChartTitle } from '@/components/shared/ChartTitle';
import { CHIP_OFF, CHIP_ON, SEGMENT_GROUP, SEGMENT_OFF } from './chipClasses';


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

  const yoursMap = new Map(yours.map(y => [y.bin, y.pct]));
  const nationalMap = new Map(national.map(n => [n.bin, n.pct]));

  const merged = bins.map(bin => ({
    x: parseInt(bin) + binSize / 2,
    nationalPct: nationalMap.get(bin) ?? 0,
    yoursPct: yoursMap.get(bin) ?? 0,
  }));

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

export function AnalyticsDashboard({ onAddPokemon }: { onAddPokemon: () => void }) {
  const t = useT();
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

  const drillDownIsYours = drillDownDexId === null;
  const activeTypeKey = drillDownSegment?.kind === 'type' ? drillDownSegment.type : null;
  const activeGenKey = drillDownSegment?.kind === 'generation' ? String(drillDownSegment.generation) : null;
  const activeShapeKey = drillDownSegment?.kind === 'shape' ? drillDownSegment.shape : null;
  const activeEvoBin = drillDownSegment?.kind === 'evoLevel'
    ? drillDownSegment.binStart + (drillDownSegment.binEnd - drillDownSegment.binStart) / 2 : null;
  const activeBstBin = drillDownSegment?.kind === 'bst'
    ? drillDownSegment.binStart + (drillDownSegment.binEnd - drillDownSegment.binStart) / 2 : null;

  const handleDrillToggle = useCallback((segment: DrillDownSegment, siblings?: DrillDownSegment[], excludeFlag?: boolean, dexId?: string | null, newOnly?: boolean) => {
    const sameDex = (dexId ?? null) === drillDownDexId;
    if (sameDex && drillDownSegment && drillDownSegment.kind === segment.kind &&
      JSON.stringify(drillDownSegment) === JSON.stringify(segment)) {
      closeDrillDown();
    } else {
      openDrillDown(segment, siblings, excludeFlag, dexId, newOnly);
    }
  }, [drillDownDexId, drillDownSegment, closeDrillDown, openDrillDown]);

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
      return {
        key: String(gen),
        label: t('browser.genChip', { gen }),
        count: d.count,
        deviation: d.deviation,
        color: CHART_BAR_RED,
        icon: generationChartIcon(gen as GenNumber),
      };
    }),
    [analytics.generationDeviation, t],
  );

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
        icon: shapeBadgeChartIcon(shape),
      };
    });
  }, [sections, excludeSpecial]);

  const typeSiblings = useMemo((): DrillDownSegment[] =>
    typeChartData.filter(d => d.count > 0).map(d => ({ kind: 'type' as const, type: rowKey(d) })),
    [typeChartData]);
  const genSiblings = useMemo((): DrillDownSegment[] =>
    genChartData.filter(d => d.count > 0).map(d => ({ kind: 'generation' as const, generation: Number(rowKey(d)) })),
    [genChartData]);
  const shapeSiblings = useMemo((): DrillDownSegment[] =>
    shapeChartData.filter(d => d.count > 0).map(d => ({ kind: 'shape' as const, shape: rowKey(d) })),
    [shapeChartData]);

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
  const isNationalSelected = selectedTypeChart === 'national';
  const selectedDex = REGIONAL_DEXES.find(d => d.id === selectedTypeChart);

  const matchupVisible = typeView === 'matchup' || drillDownSegment?.kind === 'typeMatchup';

  const typeMatchupData: ButterflyRow[] = useMemo(() => {
    if (!matchupVisible) return [];
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
      barOpacity: 1,
      icon: typeChartIcon(r.type as TypeName),
    })).sort((a, b) => isNationalSelected ? b.count - a.count : b.deviation - a.deviation);
  }, [matchupVisible, sections, selectedTypeChart, excludeSpecial, newPokemonOnly, isNationalSelected]);

  const matchupForceBidirectional = useMemo(() => {
    if (!matchupVisible) return false;
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
  }, [matchupVisible, selectedTypeChart, isNationalSelected, sections]);

  const typeMatchupSiblings = useMemo((): DrillDownSegment[] =>
    typeMatchupData.map(d => ({ kind: 'typeMatchup' as const, type: rowKey(d) })),
    [typeMatchupData]);

  const activeMatchupKey = drillDownSegment?.kind === 'typeMatchup' ? drillDownSegment.type : null;

  const sortedTypeChartData = useMemo(() => activeTypeChartData.map(row => ({ ...row, icon: typeChartIcon(rowKey(row) as TypeName) })).sort((a, b) =>
    typeSortBy === 'deviation' ? b.deviation - a.deviation
      : typeSortBy === 'label' ? a.label.localeCompare(b.label)
      : b.count - a.count
  ), [activeTypeChartData, typeSortBy]);

  const sortedMatchupData = useMemo(() => [...typeMatchupData].sort((a, b) =>
    typeSortBy === 'deviation' ? b.deviation - a.deviation
      : typeSortBy === 'label' ? a.label.localeCompare(b.label)
      : b.count - a.count
  ), [typeMatchupData, typeSortBy]);

  const sortedGenChartData = useMemo(() => [...genChartData].sort((a, b) =>
    genSortBy === 'deviation' ? b.deviation - a.deviation
      : genSortBy === 'count' ? b.count - a.count
      : Number(rowKey(a)) - Number(rowKey(b))
  ), [genChartData, genSortBy]);

  const sortedShapeChartData = useMemo(() => [...shapeChartData].sort((a, b) =>
    shapeSortBy === 'deviation' ? b.deviation - a.deviation
      : shapeSortBy === 'count' ? b.count - a.count
      : a.label.localeCompare(b.label)
  ), [shapeChartData, shapeSortBy]);

  const handleTypeBarClick = useCallback((type: string) => {
    if (selectedTypeChart === 'yours') {
      handleDrillToggle({ kind: 'type', type }, typeSiblings, excludeSpecial);
    } else {
      handleDrillToggle({ kind: 'type', type }, regionalTypeSiblings, excludeSpecial, selectedTypeChart, newPokemonOnly);
    }
  }, [selectedTypeChart, handleDrillToggle, typeSiblings, regionalTypeSiblings, excludeSpecial, newPokemonOnly]);

  const handleMatchupBarClick = useCallback((type: string) => {
    if (selectedTypeChart === 'yours') {
      handleDrillToggle({ kind: 'typeMatchup', type }, typeMatchupSiblings, excludeSpecial);
    } else {
      handleDrillToggle({ kind: 'typeMatchup', type }, typeMatchupSiblings, excludeSpecial, selectedTypeChart, newPokemonOnly);
    }
  }, [selectedTypeChart, handleDrillToggle, typeMatchupSiblings, excludeSpecial, newPokemonOnly]);

  const handleGenBarClick = useCallback((key: string) => {
    const generation = Number(key);
    if (!isNaN(generation)) handleDrillToggle({ kind: 'generation', generation }, genSiblings);
  }, [handleDrillToggle, genSiblings]);

  const handleShapeBarClick = useCallback((shape: string) => {
    handleDrillToggle({ kind: 'shape', shape }, shapeSiblings);
  }, [handleDrillToggle, shapeSiblings]);

  const syncOpenTypeDrilldown = useEffectEvent((excluded: boolean, chart: typeof selectedTypeChart, onlyNew: boolean) => {
    if (!drillDownSegment) return;
    const kind = drillDownSegment.kind;
    if (kind === 'type' || kind === 'typeMatchup') {
      const dexId = chart === 'yours' ? null : chart;
      const siblings = kind === 'typeMatchup'
        ? typeMatchupSiblings
        : (chart === 'yours' ? typeSiblings : regionalTypeSiblings);
      openDrillDown(drillDownSegment, siblings, excluded, dexId, onlyNew);
    }
  });
  useEffect(() => {
    syncOpenTypeDrilldown(excludeSpecial, selectedTypeChart, newPokemonOnly);
  }, [excludeSpecial, selectedTypeChart, newPokemonOnly]);

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

  const meanLabels = { yours: t('favorites.stats.meanYours'), options: t('analytics.meanNational'), exact: t('favorites.stats.meanExact') };
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
      <div className="flex h-full items-center justify-center">
        <EmptyState
          testId="analytics-empty"
          title={t('analytics.empty.title')}
          body={t('analytics.empty.body')}
          action={{ label: t('analytics.empty.action'), onClick: onAddPokemon }}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain md:overscroll-auto">
      <div className="p-6 pb-0 space-y-8 max-w-6xl md:max-w-2xl mx-auto">
        <section className="bg-card rounded-lg shadow-elevated overflow-hidden">
          <WhatsAdvisor />
        </section>

        <section>
          <ChartTitle as="h3" className="mb-2" text={t('analytics.type.heading')} />

          <div className="space-y-1.5 mb-3">
          <div className="flex items-stretch border-x border-border">
            <div className="shrink-0 self-stretch flex items-center gap-1.5 bg-background border-r border-border pl-2 pr-2 py-1">
              <button type="button"
                onClick={() => setSelectedTypeChart('national')}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedTypeChart === 'national'
                    ? CHIP_ON
                    : CHIP_OFF
                }`}
              >
                {t('analytics.dex.nationalShort')}
              </button>
              <button type="button"
                onClick={() => setSelectedTypeChart('yours')}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedTypeChart === 'yours'
                    ? CHIP_ON
                    : CHIP_OFF
                }`}
              >
                {t('analytics.dex.yours')}
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar items-center min-w-0 pl-2 pr-2 py-1">
              {REGIONAL_DEXES.map(dex => (
                <button type="button"
                  key={dex.id}
                  onClick={() => setSelectedTypeChart(dex.id)}
                  className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedTypeChart === dex.id
                      ? CHIP_ON
                      : CHIP_OFF
                  }`}
                >
                  {regionName(dex.id)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto py-1 -my-1 px-0.5 -mx-0.5">
            <button type="button"
              onClick={() => setExcludeSpecial(!excludeSpecial)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                excludeSpecial
                  ? CHIP_ON
                  : CHIP_OFF
              }`}
            >
              {t('analytics.excludeSpecial')}
            </button>

            {selectedDex && !isNationalSelected && selectedDex.generation >= 2 && selectedDex.id !== 'unova' && (
              <div className={`inline-flex rounded-full overflow-hidden ${SEGMENT_GROUP}`}>
                <button type="button"
                  onClick={() => setNewPokemonOnly(true)}
                  className={`px-1.5 py-0.5 rounded-l-full text-xs font-medium whitespace-nowrap transition-colors ${
                    newPokemonOnly
                      ? CHIP_ON
                      : SEGMENT_OFF
                  }`}
                >
                  {t('analytics.genOnly', { gen: selectedDex.generation })}
                </button>
                <button type="button"
                  onClick={() => setNewPokemonOnly(false)}
                  className={`px-1.5 py-0.5 rounded-r-full text-xs font-medium whitespace-nowrap transition-colors ${
                    !newPokemonOnly
                      ? CHIP_ON
                      : SEGMENT_OFF
                  }`}
                >
                  {t('analytics.regionalDex')}
                </button>
              </div>
            )}
          </div>
          </div>

          <div className="bg-card rounded-lg shadow-elevated overflow-hidden">
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
            {typeView === 'matchup' && <p className="text-sm text-muted-foreground mb-3 md:mb-4 px-3">
              {t('analytics.type.descMatchup')}
            </p>}
            <div className="px-4">
            {typeView === 'distribution' ? (
              <ButterflyChart
                alignBaselines hideLabelText iconFillsRow
                data={sortedTypeChartData}
                rowHeight={16}
                hideDeviation={isNationalSelected}
                fixedMaxCount={unfilteredMaxCount}
                fixedDevRight={fixedDevRight}
                sortBy={typeSortBy}
                onSortChange={setTypeSortBy}
                labelHeader={t('chart.header.type')}
                disableEmptyRows
                onBarClick={handleTypeBarClick}
                activeKey={
                  (selectedTypeChart === 'yours' && drillDownIsYours) ||
                  (selectedTypeChart !== 'yours' && drillDownDexId === selectedTypeChart)
                    ? activeTypeKey : null
                }
              />
            ) : typeMatchupData.length > 0 ? (
              <ButterflyChart
                alignBaselines hideLabelText iconFillsRow
                data={sortedMatchupData}
                rowHeight={16}
                scoreMode
                hideDeviation={isNationalSelected}
                forceBidirectionalCount={matchupForceBidirectional}
                sortBy={typeSortBy}
                onSortChange={setTypeSortBy}
                labelHeader={t('chart.header.type')}
                onBarClick={handleMatchupBarClick}
                activeKey={drillDownSegment?.kind === 'typeMatchup' ? activeMatchupKey : null}
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('analytics.noMatchup')}</p>
            )}
            </div>
            </div>
          </div>
        </section>

        <section>
          <ChartTitle as="h3" className="mb-2" text={t('analytics.gen.heading')} />
          <div className="bg-card rounded-lg shadow-elevated p-4">
            <ButterflyChart
                alignBaselines hideLabelText iconFillsRow
              data={sortedGenChartData}
              rowHeight={28}
              disableEmptyRows
              sortBy={genSortBy}
              onSortChange={setGenSortBy}
              labelHeader={t('chart.header.gen')}
              labelSortable
              onBarClick={handleGenBarClick}
              activeKey={activeGenKey}
            />
          </div>
        </section>

        <section>
          <ChartTitle as="h3" className="mb-2" text={t('analytics.shape.heading')} />
          <div className="bg-card rounded-lg shadow-elevated p-4">
            <ButterflyChart
                alignBaselines hideLabelText iconFillsRow
              data={sortedShapeChartData}
              rowHeight={22}
              disableEmptyRows
              sortBy={shapeSortBy}
              onSortChange={setShapeSortBy}
              labelHeader={t('chart.header.shape')}
              labelWidthBase={80}
              onBarClick={handleShapeBarClick}
              activeKey={activeShapeKey}
            />
          </div>
        </section>

        <section>
          <ChartTitle as="h3" className="mb-2" text={t('analytics.evoLevel.heading')} />
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
              meanRail={evoHist.merged.some(d => d.yoursPct > 0) ? { yours: analytics.evolutionStats.avgLevel, options: analytics.evolutionStats.nationalAvgLevel, labels: meanLabels } : undefined}
              onBarClick={(binCenter) => {
                const binStart = binCenter - evoHist.binSize / 2;
                handleDrillToggle({ kind: 'evoLevel', binStart, binEnd: binStart + evoHist.binSize }, evoLevelSiblings);
              }}
              activeBin={activeEvoBin}
            />
          </div>
        </section>

        <section>
          <ChartTitle as="h3" className="mb-2" text={t('analytics.bst.heading')} />
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
              meanRail={bstHist.merged.some(d => d.yoursPct > 0) ? { yours: analytics.bstStats.avg, options: analytics.nationalAvgBst, labels: meanLabels } : undefined}
              onBarClick={(binCenter) => {
                const binStart = binCenter - bstHist.binSize / 2;
                handleDrillToggle({ kind: 'bst', binStart, binEnd: binStart + bstHist.binSize }, bstSiblings);
              }}
              activeBin={activeBstBin}
            />
          </div>
        </section>

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

