import { useMemo } from 'react';
import { usePokedexStore, type DrillDownSegment } from '@/store/usePokedexStore';
import { getPokemonById, getEvolutionLine, getAllPokemon } from '@/hooks/usePokemonData';
import { BUILD_GROUPS } from '@/data/slot-template';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import { STARTER_IDS } from '@/data/categories';
import { TYPE_COLORS } from '@/data/type-colors';
import { computePerPokemonMatchup } from '@/hooks/useTypeDominance';
import type { Pokemon, TypeName } from '@/types/pokemon';

const STAGE_COLORS = ['#f5a3a3', '#e56060', '#dc2626'];
const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

const POKEAPI_TYPE_IDS: Record<string, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6,
  bug: 7, ghost: 8, steel: 9, fire: 10, water: 11, grass: 12,
  electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
};

interface SectionGroup {
  sectionId: string;
  sectionName: string;
  sectionColor: string;
  groups: {
    key: string;
    members: Pokemon[];
    matchedIds: Set<number>;
  }[];
}

export interface DrillDownData {
  title: string;
  subtitle: string;
  color: string;
  icon?: string;
  sections: SectionGroup[];
  totalPokemon: number;
  totalLines: number;
  showGenBadges: boolean;
  /** Per-Pokemon offense/defense multipliers for typeMatchup drill-downs */
  matchupInfo?: Map<number, { offense: number; defense: number }>;
}

export function useDrillDownData(): DrillDownData | null {
  const segment = usePokedexStore((s) => s.drillDownSegment);
  const storeSections = usePokedexStore((s) => s.sections);
  const excludeSpecial = usePokedexStore((s) => s.drillDownExcludeSpecial);
  const dexId = usePokedexStore((s) => s.drillDownDexId);
  const newOnly = usePokedexStore((s) => s.drillDownNewOnly);

  return useMemo(() => computeDrillDownData(segment, storeSections, excludeSpecial, dexId, newOnly), [segment, storeSections, excludeSpecial, dexId, newOnly]);
}

/** Pure computation — also used by carousel to pre-render adjacent panels */
export function computeDrillDownData(
  segment: DrillDownSegment | null,
  storeSections: Record<string, number[]>,
  excludeSpecial: boolean,
  dexId?: string | null,
  newOnly?: boolean,
): DrillDownData | null {
  if (!segment) return null;

  // Type matchup drilldown — group Pokemon by per-matchup score tier
  if (segment.kind === 'typeMatchup') {
    return computeTypeMatchupDrillDown(segment, storeSections, excludeSpecial);
  }

  // Regional/national dex drilldown — show that dex's Pokemon, mute those not in user's pokedex
  if (dexId) {
    return computeRegionalDrillDown(segment, storeSections, excludeSpecial, dexId, newOnly ?? false);
  }

    // Collect all placed Pokemon with their section assignments
    const pokemonToSection = new Map<number, string>();
    for (const [sectionId, ids] of Object.entries(storeSections)) {
      for (const id of ids) {
        pokemonToSection.set(id, sectionId);
      }
    }

    // Determine which IDs are "excluded" (starters/legendaries/mythicals)
    const starterSectionIds = new Set(storeSections['starter'] ?? []);
    const excludedIds = new Set<number>();
    if (excludeSpecial) {
      for (const id of pokemonToSection.keys()) {
        const p = getPokemonById(id);
        if (p && (p.isLegendary || p.isMythical || starterSectionIds.has(p.id))) {
          excludedIds.add(id);
        }
      }
    }

    // Filter placed Pokemon based on segment criteria
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

    // Need at least some matching pokemon (excluded or not) to show anything
    if (matchingIds.size === 0) return null;

    // Build evolution line groups, deduped by root
    const seenRoots = new Set<string>();
    const evoLinesBySection = new Map<string, { key: string; members: Pokemon[]; matchedIds: Set<number> }[]>();
    const nonExcludedLineRoots = new Set<string>();
    // Count distinct evolution chains (not branches) for subtitle
    const nonExcludedChainIds = new Set<number>();

    const placedIdSet = new Set(pokemonToSection.keys());
    for (const id of matchingIds) {
      const line = getEvolutionLine(id, placedIdSet);
      const rootKey = line.map(m => m.id).join('-');
      if (seenRoots.has(rootKey)) continue;
      seenRoots.add(rootKey);

      // Track if this line has any non-excluded matching member
      const hasNonExcluded = [...line].some(m => matchingNonExcludedIds.has(m.id));
      if (hasNonExcluded) {
        nonExcludedLineRoots.add(rootKey);
        // Track by chain ID for accurate line count (branches share a chain)
        const p = getPokemonById(id);
        if (p) nonExcludedChainIds.add(p.evolutionChainId);
      }

      // Figure out which section this line belongs to (use first placed member's section)
      let lineSectionId = 'other';
      for (const m of line) {
        const sec = pokemonToSection.get(m.id);
        if (sec) { lineSectionId = sec; break; }
      }

      // matchedIds = members matching the segment AND not excluded
      // Excluded members will appear as part of the line but grayed out
      const lineMatchedIds = new Set<number>();
      for (const m of line) {
        if (matchingIds.has(m.id) && !excludedIds.has(m.id)) {
          lineMatchedIds.add(m.id);
        }
      }

      const groups = evoLinesBySection.get(lineSectionId) ?? [];
      groups.push({ key: rootKey, members: line, matchedIds: lineMatchedIds });
      evoLinesBySection.set(lineSectionId, groups);
    }

    // Build sections in BUILD_GROUPS order
    const sections: SectionGroup[] = [];
    for (const bg of BUILD_GROUPS) {
      const groups = evoLinesBySection.get(bg.id);
      if (!groups || groups.length === 0) continue;
      // Sort by build page order (position in the section array)
      const sectionIds = storeSections[bg.id] ?? [];
      const posMap = new Map(sectionIds.map((id, i) => [id, i]));
      groups.sort((a, b) => {
        const aPos = Math.min(...a.members.map(m => posMap.get(m.id) ?? Infinity));
        const bPos = Math.min(...b.members.map(m => posMap.get(m.id) ?? Infinity));
        return aPos - bPos;
      });
      sections.push({
        sectionId: bg.id,
        sectionName: bg.name,
        sectionColor: bg.color,
        groups,
      });
    }

    // Subtitle counts only non-excluded pokemon; lines counted by chain (not branch)
    const countForSubtitle = matchingNonExcludedIds.size;
    const linesForSubtitle = nonExcludedChainIds.size;
    const { title, color, icon } = getSegmentMeta(segment);

    return {
      title,
      subtitle: `${countForSubtitle} Pokémon across ${linesForSubtitle} line${linesForSubtitle !== 1 ? 's' : ''}`,
      color,
      icon,
      sections,
      totalPokemon: countForSubtitle,
      totalLines: linesForSubtitle,
      showGenBadges: false,
    };
}

/** Regional/national dex drilldown: show all Pokemon from that dex matching the segment,
 *  muting those not in the user's pokedex. Groups by generation instead of build sections. */
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

  // All Pokemon in this dex
  let dexPokemon: Pokemon[];
  if (isNational) {
    dexPokemon = getAllPokemon();
  } else {
    dexPokemon = dex!.pokemonIds.map(id => getPokemonById(id)).filter(Boolean) as Pokemon[];
  }

  // Apply "gen X only" filter
  if (newOnly && dex) {
    dexPokemon = dexPokemon.filter(p => p.generation === dex.generation);
  }

  // Apply exclude starters/legendaries/mythicals
  if (excludeSpecial) {
    dexPokemon = dexPokemon.filter(p => !p.isLegendary && !p.isMythical && !STARTER_IDS.has(p.id));
  }

  // User's placed Pokemon (for highlight vs mute)
  const userPlacedIds = new Set(Object.values(storeSections).flat());

  // Filter to Pokemon matching the segment
  const matchingIds = new Set<number>();
  for (const p of dexPokemon) {
    if (matchesSegment(p, p.id, segment)) {
      matchingIds.add(p.id);
    }
  }

  if (matchingIds.size === 0) return null;

  // Build evolution line groups, grouped by generation
  const seenRoots = new Set<string>();
  const evoLinesByGen = new Map<number, { key: string; members: Pokemon[]; matchedIds: Set<number> }[]>();
  const chainIds = new Set<number>();

  for (const id of matchingIds) {
    const line = getEvolutionLine(id, userPlacedIds);
    const rootKey = line.map(m => m.id).join('-');
    if (seenRoots.has(rootKey)) continue;
    seenRoots.add(rootKey);

    const p = getPokemonById(id);
    if (p) chainIds.add(p.evolutionChainId);

    // matchedIds = members that match the segment AND are in the user's pokedex
    // Non-placed Pokemon will appear but be muted (opacity-35)
    const lineMatchedIds = new Set<number>();
    for (const m of line) {
      if (matchingIds.has(m.id) && userPlacedIds.has(m.id)) {
        lineMatchedIds.add(m.id);
      }
    }

    const gen = line[0].generation;
    const groups = evoLinesByGen.get(gen) ?? [];
    groups.push({ key: rootKey, members: line, matchedIds: lineMatchedIds });
    evoLinesByGen.set(gen, groups);
  }

  // Build sections grouped by generation, sorted by gen number
  const genColors = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];
  const sections: SectionGroup[] = [];
  const sortedGens = [...evoLinesByGen.keys()].sort((a, b) => a - b);
  for (const gen of sortedGens) {
    const groups = evoLinesByGen.get(gen)!;
    // Sort by national dex ID within each gen
    groups.sort((a, b) => a.members[0].id - b.members[0].id);
    sections.push({
      sectionId: `gen-${gen}`,
      sectionName: `Generation ${gen}`,
      sectionColor: genColors[(gen - 1) % genColors.length],
      groups,
    });
  }

  const dexLabel = isNational ? 'National Dex' : dex!.name;
  const { title, color, icon } = getSegmentMeta(segment);

  return {
    title: `${title} — ${dexLabel}`,
    subtitle: `${matchingIds.size} Pokémon across ${chainIds.size} line${chainIds.size !== 1 ? 's' : ''}`,
    color,
    icon,
    sections,
    totalPokemon: matchingIds.size,
    totalLines: chainIds.size,
    showGenBadges: true,
  };
}

/** Type matchup drilldown: group all placed Pokemon by their matchup score tier against the attacking type */
function computeTypeMatchupDrillDown(
  segment: DrillDownSegment & { kind: 'typeMatchup' },
  storeSections: Record<string, number[]>,
  excludeSpecial: boolean,
): DrillDownData | null {
  const allIds = Object.values(storeSections).flat();
  const placedIdSet = new Set(allIds);
  const starterSectionIds = new Set(storeSections['starter'] ?? []);
  let pokemon = allIds.map(id => getPokemonById(id)).filter(Boolean).map(p => p!);

  if (excludeSpecial) {
    pokemon = pokemon.filter(p => !p.isLegendary && !p.isMythical && !starterSectionIds.has(p.id));
  }

  if (pokemon.length === 0) return null;

  // Compute per-pokemon matchup scores
  const matchups = computePerPokemonMatchup(segment.type as TypeName, pokemon);

  // Store per-pokemon offense/defense for chip display
  const matchupInfo = new Map<number, { offense: number; defense: number }>();

  // Group by integer-floored score tier (skip tier 0 — evenly matched)
  const tierMap = new Map<number, Set<number>>();
  const matchupById = new Map<number, number>();
  for (const m of matchups) {
    matchupInfo.set(m.pokemon.id, { offense: m.offense, defense: m.defense });
    const tier = Math.floor(m.matchup);
    if (tier === 0) continue; // filter out evenly matched
    matchupById.set(m.pokemon.id, m.matchup);
    if (!tierMap.has(tier)) tierMap.set(tier, new Set());
    tierMap.get(tier)!.add(m.pokemon.id);
  }

  // Sort tiers descending (best matchup first)
  const sortedTiers = [...tierMap.keys()].sort((a, b) => b - a);

  // Color gradient from green (advantage) through yellow (neutral) to red (disadvantage)
  const tierColors = new Map<number, string>([
    [5, '#064e3b'], [4, '#065f46'], [3, '#15803d'], [2, '#22c55e'], [1, '#86efac'],
    [0, '#fbbf24'],
    [-1, '#fb923c'], [-2, '#ef4444'], [-3, '#991b1b'], [-4, '#450a0a'],
  ]);

  const sections: SectionGroup[] = [];
  for (const tier of sortedTiers) {
    const ids = tierMap.get(tier)!;
    const label = tier > 0
      ? `+${tier} ${tier === 1 ? 'doubling' : 'doublings'} of advantage`
      : `${tier} ${tier === -1 ? 'doubling' : 'doublings'} of advantage`;
    const color = tierColors.get(tier) ?? (tier > 0 ? '#15803d' : '#991b1b');
    const meta = { label, color };

    // Build evolution line groups, sorted by matchup score descending
    const seenRoots = new Set<string>();
    const groups: { key: string; members: Pokemon[]; matchedIds: Set<number> }[] = [];

    // Sort Pokemon in this tier by matchup descending
    const sortedIds = [...ids].sort((a, b) => (matchupById.get(b) ?? 0) - (matchupById.get(a) ?? 0));

    for (const id of sortedIds) {
      const line = getEvolutionLine(id, placedIdSet);
      const rootKey = line.map(p => p.id).join('-');
      if (seenRoots.has(rootKey)) continue;
      seenRoots.add(rootKey);

      const matchedIds = new Set<number>();
      for (const m of line) {
        if (ids.has(m.id)) matchedIds.add(m.id);
      }
      groups.push({ key: rootKey, members: line, matchedIds });
    }

    sections.push({
      sectionId: `tier-${tier}`,
      sectionName: meta.label,
      sectionColor: meta.color,
      groups,
    });
  }

  const { title, color, icon } = getSegmentMeta(segment);
  const shownPokemon = sections.reduce((s, sec) => s + sec.groups.reduce((g, gr) => g + gr.matchedIds.size, 0), 0);
  return {
    title,
    subtitle: `${shownPokemon} Pokémon with non-neutral matchups`,
    color,
    icon,
    sections,
    totalPokemon: shownPokemon,
    totalLines: sections.reduce((s, sec) => s + sec.groups.length, 0),
    showGenBadges: false,
    matchupInfo,
  };
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
      return true; // all pokemon shown, grouped by score tier
  }
}

function getSegmentMeta(segment: DrillDownSegment): { title: string; color: string; icon?: string } {
  switch (segment.kind) {
    case 'type': {
      const cap = segment.type.charAt(0).toUpperCase() + segment.type.slice(1);
      const typeId = POKEAPI_TYPE_IDS[segment.type];
      return {
        title: `${cap} Type`,
        color: TYPE_COLORS[segment.type as keyof typeof TYPE_COLORS] ?? '#888',
        icon: typeId ? `/sprites/types/${typeId}.png` : undefined,
      };
    }
    case 'generation':
      return {
        title: `Generation ${segment.generation}`,
        color: GEN_COLORS[(segment.generation - 1) % GEN_COLORS.length],
      };
    case 'stage': {
      const names = ['Single', 'Double', 'Triple'];
      return {
        title: `${names[segment.lineLength - 1]}-Stage / Stage ${segment.stage}`,
        color: STAGE_COLORS[segment.stage - 1],
      };
    }
    case 'stageAll':
      return {
        title: `All Stage ${segment.stage} Pokémon`,
        color: STAGE_COLORS[segment.stage - 1],
      };
    case 'lineLength': {
      const names = ['Single', 'Double', 'Triple'];
      return {
        title: `${names[segment.lineLength - 1]}-Stage Lines`,
        color: STAGE_COLORS[segment.lineLength - 1],
      };
    }
    case 'evoLevel':
      return {
        title: `Evolves at Lv ${segment.binStart}–${segment.binEnd - 1}`,
        color: '#ef4444',
      };
    case 'bst':
      return {
        title: `BST ${segment.binStart}–${segment.binEnd - 1}`,
        color: '#ef4444',
      };
    case 'typeMatchup': {
      const cap = segment.type.charAt(0).toUpperCase() + segment.type.slice(1);
      const typeId = POKEAPI_TYPE_IDS[segment.type];
      return {
        title: `${cap} Matchup`,
        color: TYPE_COLORS[segment.type as keyof typeof TYPE_COLORS] ?? '#888',
        icon: typeId ? `/sprites/types/${typeId}.png` : undefined,
      };
    }
  }
}
