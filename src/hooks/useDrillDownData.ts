import type { PokemonLabel } from '@/i18n/names';
import type { ReactNode } from 'react';
import { type DrillDownSegment } from '@/store/usePokedexStore';
import { getPokemonById, getEvolutionLine, getAllPokemon, isSpecial } from '@/hooks/usePokemonData';
import { BUILD_GROUPS } from '@/data/slot-template';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import { STARTER_IDS } from '@/data/categories';
import { TYPE_COLORS } from '@/data/type-colors';
import { computePerPokemonMatchup } from '@/hooks/useTypeDominance';
import type { Pokemon, TypeName, ShapeName } from '@/types/pokemon';
import { typeIconPath } from '@/data/type-ids';
import { getLocale, regionName, sectionName, shapeLabel, t, tn, typeLabel } from '@/i18n';

const STAGE_COLORS = ['#f5a3a3', '#e56060', '#dc2626'];
const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

interface SectionGroup {
  sectionId: string;
  attributes?: Record<string, string>;
  sectionName: string;
  sectionColor: string;
  groups: {
    key: string;
    members: Pokemon[];
    matchedIds: Set<number>;
    mutedIds?: Set<number>;
    anchorGen?: number;
    tileOverlay?: (pokemon: Pokemon, spritePx: number) => ReactNode;
    tileAttributes?: Record<string, string>;
    tileTestId?: string;
    displayLabel?: PokemonLabel;
    onSelect?: (pokemon: Pokemon) => void;

  }[];
}

export interface DrillDownData {
  headerContent?: ReactNode;
  emptyContent?: ReactNode;
  standaloneTiles?: boolean;
  title: string;
  subtitle: string;
  color: string;
  icon?: string;
  sections: SectionGroup[];
  totalPokemon: number;
  totalLines: number;
  showGenBadges: boolean;
  showShapeBadges?: boolean;
  shape?: ShapeName;
  matchupInfo?: Map<number, { offense: number; defense: number; bestDefenseType: TypeName }>;
  matchupType?: TypeName;
}

export function computeDrillDownData(
  segment: DrillDownSegment | null,
  storeSections: Record<string, number[]>,
  excludeSpecial: boolean,
  dexId?: string | null,
  newOnly?: boolean,
): DrillDownData | null {
  if (!segment) return null;

  if (segment.kind === 'typeMatchup') {
    return computeTypeMatchupDrillDown(segment, storeSections, excludeSpecial, dexId ?? null, newOnly ?? false);
  }

  if (dexId) {
    return computeRegionalDrillDown(segment, storeSections, excludeSpecial, dexId, newOnly ?? false);
  }

    const pokemonToSection = new Map<number, string>();
    for (const [sectionId, ids] of Object.entries(storeSections)) {
      for (const id of ids) {
        pokemonToSection.set(id, sectionId);
      }
    }

    const starterSectionIds = new Set(storeSections['starter'] ?? []);
    const excludedIds = new Set<number>();
    if (excludeSpecial) {
      for (const id of pokemonToSection.keys()) {
        const p = getPokemonById(id);
        if (p && isSpecial(p, starterSectionIds)) {
          excludedIds.add(id);
        }
      }
    }

    const matchingIds = new Set<number>();
    const matchingNonExcludedIds = new Set<number>();
    const allPlacedIds = [...pokemonToSection.keys()];

    for (const id of allPlacedIds) {
      const p = getPokemonById(id);
      if (!p) continue;
      if (matchesSegment(p, id, segment)) {
        matchingIds.add(id);
        if (!excludedIds.has(id)) {
          matchingNonExcludedIds.add(id);
        }
      }
    }

    if (matchingIds.size === 0) return null;

    const seenRoots = new Set<string>();
    const evoLinesBySection = new Map<string, { key: string; members: Pokemon[]; matchedIds: Set<number>; mutedIds?: Set<number> }[]>();
    const nonExcludedLineRoots = new Set<string>();
    const nonExcludedChainIds = new Set<number>();

    const placedIdSet = new Set(pokemonToSection.keys());
    for (const id of matchingIds) {
      const line = getEvolutionLine(id, placedIdSet);
      const rootKey = line.map(m => m.id).join('-');
      if (seenRoots.has(rootKey)) continue;
      seenRoots.add(rootKey);

      const hasNonExcluded = [...line].some(m => matchingNonExcludedIds.has(m.id));
      if (hasNonExcluded) {
        nonExcludedLineRoots.add(rootKey);
        const p = getPokemonById(id);
        if (p) nonExcludedChainIds.add(p.evolutionChainId);
      }

      let lineSectionId = 'other';
      for (const m of line) {
        const sec = pokemonToSection.get(m.id);
        if (sec) { lineSectionId = sec; break; }
      }

      const lineMatchedIds = new Set<number>();
      const lineMutedIds = new Set<number>();
      for (const m of line) {
        if (matchingIds.has(m.id) && !excludedIds.has(m.id)) {
          lineMatchedIds.add(m.id);
        } else {
          lineMutedIds.add(m.id);
        }
      }

      const groups = evoLinesBySection.get(lineSectionId) ?? [];
      groups.push({
        key: rootKey,
        members: line,
        matchedIds: lineMatchedIds,
        mutedIds: lineMutedIds.size > 0 ? lineMutedIds : undefined,
      });
      evoLinesBySection.set(lineSectionId, groups);
    }

    const sections: SectionGroup[] = [];
    for (const bg of BUILD_GROUPS) {
      const groups = evoLinesBySection.get(bg.id);
      if (!groups || groups.length === 0) continue;
      const sectionIds = storeSections[bg.id] ?? [];
      const posMap = new Map(sectionIds.map((id, i) => [id, i]));
      groups.sort((a, b) => {
        const aPos = Math.min(...a.members.map(m => posMap.get(m.id) ?? Infinity));
        const bPos = Math.min(...b.members.map(m => posMap.get(m.id) ?? Infinity));
        return aPos - bPos;
      });
      sections.push({
        sectionId: bg.id,
        sectionName: sectionName(bg.id),
        sectionColor: bg.color,
        groups,
      });
    }

    const countForSubtitle = matchingNonExcludedIds.size;
    const linesForSubtitle = nonExcludedChainIds.size;
    const { title, color, icon } = getSegmentMeta(segment);

    return {
      title,
      subtitle: tn('drilldown.subtitle', linesForSubtitle, { pokemon: countForSubtitle }),
      color,
      icon,
      sections,
      totalPokemon: countForSubtitle,
      totalLines: linesForSubtitle,
      showGenBadges: segment.kind === 'generation',
      showShapeBadges: segment.kind === 'shape',
      shape: segment.kind === 'shape' ? (segment.shape as ShapeName) : undefined,
    };
}

function computeRegionalDrillDown(
  segment: DrillDownSegment,
  storeSections: Record<string, number[]>,
  excludeSpecial: boolean,
  dexId: string,
  newOnly: boolean,
): DrillDownData | null {
  const isNational = dexId === 'national';
  const dex = REGIONAL_DEXES.find(d => d.id === dexId);
  if (!dex && !isNational) return null;

  let dexPokemon: Pokemon[];
  if (isNational) {
    dexPokemon = getAllPokemon();
  } else {
    dexPokemon = dex!.pokemonIds.map(id => getPokemonById(id)).filter(Boolean) as Pokemon[];
  }

  if (newOnly && dex) {
    dexPokemon = dexPokemon.filter(p => p.generation === dex.generation);
  }

  const excludedIds = new Set<number>();
  if (excludeSpecial) {
    for (const p of dexPokemon) {
      if (isSpecial(p, STARTER_IDS)) {
        excludedIds.add(p.id);
      }
    }
  }

  const userPlacedIds = new Set(Object.values(storeSections).flat());

  const matchingIds = new Set<number>();
  const matchingNonExcludedIds = new Set<number>();
  for (const p of dexPokemon) {
    if (matchesSegment(p, p.id, segment)) {
      matchingIds.add(p.id);
      if (!excludedIds.has(p.id)) matchingNonExcludedIds.add(p.id);
    }
  }

  if (matchingIds.size === 0) return null;

  const bucketKey = (rootKey: string, gen: number) => `${rootKey}:${gen}`;
  const seenAnchors = new Set<string>();
  const evoLinesByGen = new Map<number, { key: string; members: Pokemon[]; matchedIds: Set<number>; mutedIds?: Set<number>; anchorGen?: number }[]>();
  const chainIds = new Set<number>();
  const anchorGenForNewOnly = dex?.generation ?? 1;

  const buildEntry = (line: Pokemon[], rootKey: string, bucketGen: number) => {
    const lineMatchedIds = new Set<number>();
    const lineMutedIds = new Set<number>();
    for (const m of line) {
      const matches = matchingIds.has(m.id);
      const excluded = excludedIds.has(m.id);
      const rightGen = m.generation === bucketGen;
      if (matches && userPlacedIds.has(m.id) && !excluded && rightGen) {
        lineMatchedIds.add(m.id);
      }
      if (!matches || excluded || !rightGen) {
        lineMutedIds.add(m.id);
      }
    }
    return {
      key: bucketKey(rootKey, bucketGen),
      members: line,
      matchedIds: lineMatchedIds,
      mutedIds: lineMutedIds.size > 0 ? lineMutedIds : undefined,
      anchorGen: bucketGen,
    };
  };

  for (const id of matchingIds) {
    const member = getPokemonById(id);
    if (!member) continue;
    const line = getEvolutionLine(id, userPlacedIds);
    const rootKey = line.map(m => m.id).join('-');
    if (!excludedIds.has(id)) chainIds.add(member.evolutionChainId);

    const bucketGen = newOnly ? anchorGenForNewOnly : member.generation;
    const anchorKey = bucketKey(rootKey, bucketGen);
    if (seenAnchors.has(anchorKey)) continue;
    seenAnchors.add(anchorKey);

    const entry = buildEntry(line, rootKey, bucketGen);
    const groups = evoLinesByGen.get(bucketGen) ?? [];
    groups.push(entry);
    evoLinesByGen.set(bucketGen, groups);
  }

  const genColors = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];
  const sections: SectionGroup[] = [];
  if (newOnly) {
    const groups = evoLinesByGen.get(anchorGenForNewOnly) ?? [];
    groups.sort((a, b) => a.members[0].id - b.members[0].id);
    if (groups.length > 0) {
      sections.push({
        sectionId: `gen-${anchorGenForNewOnly}`,
        sectionName: t('drilldown.generationTitle', { gen: anchorGenForNewOnly }),
        sectionColor: genColors[(anchorGenForNewOnly - 1) % genColors.length],
        groups,
      });
    }
  } else {
    const sortedGens = [...evoLinesByGen.keys()].sort((a, b) => a - b);
    for (const gen of sortedGens) {
      const groups = evoLinesByGen.get(gen)!;
      groups.sort((a, b) => a.members[0].id - b.members[0].id);
      sections.push({
        sectionId: `gen-${gen}`,
        sectionName: t('drilldown.generationTitle', { gen }),
        sectionColor: genColors[(gen - 1) % genColors.length],
        groups,
      });
    }
  }

  const dexLabel = isNational ? t('dex.national') : regionName(dex!.id);
  const { title, color, icon } = getSegmentMeta(segment);

  return {
    title: t('drilldown.titleWithDex', { title, dex: dexLabel }),
    subtitle: tn('drilldown.subtitle', chainIds.size, { pokemon: matchingNonExcludedIds.size }),
    color,
    icon,
    sections,
    totalPokemon: matchingNonExcludedIds.size,
    totalLines: chainIds.size,
    showGenBadges: true,
  };
}

const _nationalMatchupCache = new Map<string, DrillDownData>();

function computeTypeMatchupDrillDown(
  segment: DrillDownSegment & { kind: 'typeMatchup' },
  storeSections: Record<string, number[]>,
  excludeSpecial: boolean,
  dexId: string | null,
  newOnly: boolean,
): DrillDownData | null {
  const userPlacedIds = new Set(Object.values(storeSections).flat());
  const isRegional = dexId !== null && dexId !== 'yours';

  if (isRegional) {
    const cacheKey = `${getLocale()}|${segment.type}|${dexId}|${excludeSpecial}|${newOnly}`;
    const cached = _nationalMatchupCache.get(cacheKey);
    if (cached) return cached;
  }

  let pokemon: Pokemon[];
  let isExcluded: (p: Pokemon) => boolean = () => false;
  if (isRegional) {
    const isNational = dexId === 'national';
    const dex = REGIONAL_DEXES.find(d => d.id === dexId);
    if (!dex && !isNational) return null;
    pokemon = isNational
      ? getAllPokemon()
      : dex!.pokemonIds.map(id => getPokemonById(id)).filter(Boolean).map(p => p!);
    if (newOnly && dex) {
      pokemon = pokemon.filter(p => p.generation === dex.generation);
    }
    if (excludeSpecial) {
      isExcluded = (p) => isSpecial(p, STARTER_IDS);
    }
  } else {
    const allIds = Object.values(storeSections).flat();
    const starterSectionIds = new Set(storeSections['starter'] ?? []);
    pokemon = allIds.map(id => getPokemonById(id)).filter(Boolean).map(p => p!);
    if (excludeSpecial) {
      isExcluded = (p) => isSpecial(p, starterSectionIds);
    }
  }

  if (pokemon.length === 0) return null;

  const excludedIds = new Set<number>();
  for (const p of pokemon) if (isExcluded(p)) excludedIds.add(p.id);
  const placedIdSet = isRegional ? userPlacedIds : new Set(pokemon.map(p => p.id));

  const matchups = computePerPokemonMatchup(segment.type as TypeName, pokemon);

  const matchupInfo = new Map<number, { offense: number; defense: number; bestDefenseType: TypeName }>();

  const tierMap = new Map<number, Set<number>>();
  const matchupById = new Map<number, number>();
  for (const m of matchups) {
    matchupInfo.set(m.pokemon.id, { offense: m.offense, defense: m.defense, bestDefenseType: m.bestDefenseType });
    const tier = Math.floor(m.matchup);
    if (tier === 0) continue;
    matchupById.set(m.pokemon.id, m.matchup);
    if (excludedIds.has(m.pokemon.id)) continue;
    if (!tierMap.has(tier)) tierMap.set(tier, new Set());
    tierMap.get(tier)!.add(m.pokemon.id);
  }

  const sortedTiers = [...tierMap.keys()].sort((a, b) => b - a);

  const tierColors = new Map<number, string>([
    [5, '#064e3b'], [4, '#065f46'], [3, '#15803d'], [2, '#22c55e'], [1, '#86efac'],
    [0, '#fbbf24'],
    [-1, '#fb923c'], [-2, '#ef4444'], [-3, '#991b1b'], [-4, '#450a0a'],
  ]);

  const sections: SectionGroup[] = [];
  for (const tier of sortedTiers) {
    const ids = tierMap.get(tier)!;
    const label = tier > 0
      ? tn('drilldown.tier.gain', tier)
      : tn('drilldown.tier.loss', Math.abs(tier));
    const color = tierColors.get(tier) ?? (tier > 0 ? '#15803d' : '#991b1b');
    const meta = { label, color };

    const seenRoots = new Set<string>();
    const groups: { key: string; members: Pokemon[]; matchedIds: Set<number>; mutedIds?: Set<number> }[] = [];

    const sortedIds = [...ids].sort((a, b) => (matchupById.get(b) ?? 0) - (matchupById.get(a) ?? 0));

    for (const id of sortedIds) {
      const line = getEvolutionLine(id, placedIdSet);
      const rootKey = line.map(p => p.id).join('-');
      if (seenRoots.has(rootKey)) continue;
      seenRoots.add(rootKey);

      const matchedIds = new Set<number>();
      const lineMutedIds = new Set<number>();
      for (const m of line) {
        if (ids.has(m.id)) matchedIds.add(m.id);
        if (excludedIds.has(m.id)) lineMutedIds.add(m.id);
      }
      for (const m of line) {
        if (!matchupInfo.has(m.id)) {
          const extra = computePerPokemonMatchup(segment.type as TypeName, [m]);
          if (extra.length > 0) {
            matchupInfo.set(m.id, { offense: extra[0].offense, defense: extra[0].defense, bestDefenseType: extra[0].bestDefenseType });
          }
        }
      }
      groups.push({
        key: rootKey,
        members: line,
        matchedIds,
        mutedIds: lineMutedIds.size > 0 ? lineMutedIds : undefined,
      });
    }

    sections.push({
      sectionId: `tier-${tier}`,
      sectionName: meta.label,
      sectionColor: meta.color,
      groups,
    });
  }

  const { title, color, icon } = getSegmentMeta(segment);
  const shownPokemon = [...tierMap.values()].reduce((s, ids) => s + ids.size, 0);
  const dexLabel = isRegional ? (dexId === 'national' ? t('dex.national') : regionName(dexId)) : null;
  const result: DrillDownData = {
    title: dexLabel ? t('drilldown.titleWithDex', { title, dex: dexLabel }) : title,
    subtitle: t('drilldown.matchupSubtitle', { count: shownPokemon }),
    color,
    icon,
    sections,
    totalPokemon: shownPokemon,
    totalLines: sections.reduce((s, sec) => s + sec.groups.length, 0),
    showGenBadges: isRegional,
    matchupInfo,
    matchupType: segment.type as TypeName,
  };
  if (isRegional) {
    const cacheKey = `${getLocale()}|${segment.type}|${dexId}|${excludeSpecial}|${newOnly}`;
    _nationalMatchupCache.set(cacheKey, result);
  }
  return result;
}

function matchesSegment(p: Pokemon, id: number, segment: DrillDownSegment): boolean {
  switch (segment.kind) {
    case 'type':
      return p.types.includes(segment.type as never);
    case 'generation':
      return p.generation === segment.generation;
    case 'stage': {
      const line = getEvolutionLine(id);
      const lineLen = Math.min(line.length, 3);
      const stage = Math.min(p.evolutionStage, 3);
      return lineLen === segment.lineLength && stage === segment.stage;
    }
    case 'stageAll': {
      const stage = Math.min(p.evolutionStage, 3);
      return stage === segment.stage;
    }
    case 'lineLength': {
      const line = getEvolutionLine(id);
      const lineLen = Math.min(line.length, 3);
      return lineLen === segment.lineLength;
    }
    case 'evoLevel':
      return p.evolutionLevel !== undefined && p.evolutionLevel !== null &&
        p.evolutionLevel >= segment.binStart && p.evolutionLevel < segment.binEnd;
    case 'bst':
      return p.bst >= segment.binStart && p.bst < segment.binEnd;
    case 'typeMatchup':
      return true;
    case 'shape':
      return p.shape === segment.shape;
  }
}

function lineLengthWord(length: number): string {
  const key = length === 1 ? 'drilldown.lineLength.1' : length === 2 ? 'drilldown.lineLength.2' : 'drilldown.lineLength.3';
  return t(key);
}

function getSegmentMeta(segment: DrillDownSegment): { title: string; color: string; icon?: string } {
  switch (segment.kind) {
    case 'type': {
      return {
        title: t('drilldown.typeTitle', { type: typeLabel(segment.type as TypeName) }),
        color: TYPE_COLORS[segment.type as keyof typeof TYPE_COLORS] ?? '#888',
        icon: typeIconPath(segment.type as TypeName),
      };
    }
    case 'generation':
      return {
        title: t('drilldown.generationTitle', { gen: segment.generation }),
        color: GEN_COLORS[(segment.generation - 1) % GEN_COLORS.length],
      };
    case 'stage': {
      return {
        title: t('drilldown.stageTitle', { length: lineLengthWord(segment.lineLength), stage: segment.stage }),
        color: STAGE_COLORS[segment.stage - 1],
      };
    }
    case 'stageAll':
      return {
        title: t('drilldown.stageAllTitle', { stage: segment.stage }),
        color: STAGE_COLORS[segment.stage - 1],
      };
    case 'lineLength': {
      return {
        title: t('drilldown.lineLengthTitle', { length: lineLengthWord(segment.lineLength) }),
        color: STAGE_COLORS[segment.lineLength - 1],
      };
    }
    case 'evoLevel':
      return {
        title: t('drilldown.evoLevelTitle', { from: segment.binStart, to: segment.binEnd - 1 }),
        color: '#ef4444',
      };
    case 'bst':
      return {
        title: t('drilldown.bstTitle', { from: segment.binStart, to: segment.binEnd - 1 }),
        color: '#ef4444',
      };
    case 'typeMatchup': {
      return {
        title: t('drilldown.matchupTitle', { type: typeLabel(segment.type as TypeName) }),
        color: TYPE_COLORS[segment.type as keyof typeof TYPE_COLORS] ?? '#888',
        icon: typeIconPath(segment.type as TypeName),
      };
    }
    case 'shape':
      return {
        title: t('drilldown.shapeTitle', { shape: shapeLabel(segment.shape as ShapeName) }),
        color: '#ef4444',
      };
  }
}
