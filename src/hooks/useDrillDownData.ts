import { type DrillDownSegment } from '@/store/usePokedexStore';
import { getPokemonById, getEvolutionLine, getAllPokemon, isSpecial } from '@/hooks/usePokemonData';
import { BUILD_GROUPS } from '@/data/slot-template';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import { STARTER_IDS } from '@/data/categories';
import { TYPE_COLORS } from '@/data/type-colors';
import { computePerPokemonMatchup } from '@/hooks/useTypeDominance';
import type { Pokemon, TypeName, ShapeName } from '@/types/pokemon';
import { typeIconPath } from '@/data/type-ids';
import { regionName, sectionName, shapeLabel, t, tn, typeLabel } from '@/i18n';

const STAGE_COLORS = ['#f5a3a3', '#e56060', '#dc2626'];
const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

interface SectionGroup {
  sectionId: string;
  sectionName: string;
  sectionColor: string;
  groups: {
    key: string;
    members: Pokemon[];
    matchedIds: Set<number>;
    /** Members shown as context but de-emphasized (opacity-35). Used for
     *  starters/legendaries/mythicals when the "No Starters/Legendaries"
     *  toggle is on — they're excluded from the over/under-indexing calc
     *  and from the subtitle counts, but still rendered so the user can
     *  see what was filtered out. */
    mutedIds?: Set<number>;
    /** Explicit home gen for this placement (regional drilldown places a
     *  line once per gen that has a matching member in it). */
    anchorGen?: number;
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
  /** When true, muted (off-segment) members get a corner badge showing their own
   *  body shape — used by the shape drilldown so you can see why a chain-mate is
   *  de-emphasized (e.g. Gyarados in a "Fins" drilldown is Serpent-shaped). */
  showShapeBadges?: boolean;
  /** The segment's own body shape (shape drilldowns only) — drives the header /
   *  nav shape icon. Undefined for every other drilldown kind. */
  shape?: ShapeName;
  /** Per-Pokemon offense/defense multipliers for typeMatchup drill-downs */
  matchupInfo?: Map<number, { offense: number; defense: number; bestDefenseType: TypeName }>;
  /** The type being matched (typeMatchup drilldowns only) */
  matchupType?: TypeName;
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
    return computeTypeMatchupDrillDown(segment, storeSections, excludeSpecial, dexId ?? null, newOnly ?? false);
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
        if (p && isSpecial(p, starterSectionIds)) {
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
    const evoLinesBySection = new Map<string, { key: string; members: Pokemon[]; matchedIds: Set<number>; mutedIds?: Set<number> }[]>();
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

      // matchedIds = members matching the segment AND not excluded.
      // mutedIds = chain-mates that don't match the segment (e.g. Rolycoly in
      // a Fire drilldown is Rock-only but travels with Carkol/Coalossal) plus
      // members matching the segment but excluded by the "No Starters/
      // Legendaries" toggle. Both get rendered as de-emphasized context.
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
        sectionName: sectionName(bg.id),
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

  // Identify starters/legendaries/mythicals for muting (not removal) when
  // excludeSpecial is active. They're still rendered as context but
  // de-emphasized and excluded from the subtitle counts.
  const excludedIds = new Set<number>();
  if (excludeSpecial) {
    for (const p of dexPokemon) {
      if (isSpecial(p, STARTER_IDS)) {
        excludedIds.add(p.id);
      }
    }
  }

  // User's placed Pokemon (for highlight vs mute)
  const userPlacedIds = new Set(Object.values(storeSections).flat());

  // Filter to Pokemon matching the segment (excluded members kept for context)
  const matchingIds = new Set<number>();
  const matchingNonExcludedIds = new Set<number>();
  for (const p of dexPokemon) {
    if (matchesSegment(p, p.id, segment)) {
      matchingIds.add(p.id);
      if (!excludedIds.has(p.id)) matchingNonExcludedIds.add(p.id);
    }
  }

  if (matchingIds.size === 0) return null;

  // Place each matching-non-excluded member into its own gen bucket.
  // A line with matches in multiple gens appears once in each — e.g. in the
  // Hoenn Psychic drilldown, Wynaut (Gen 3) + Wobbuffet (Gen 2) both match,
  // so the line shows in Gen 2 (Wobbuffet full opacity, Wynaut muted) AND
  // Gen 3 (Wynaut full opacity, Wobbuffet muted). Within a single gen,
  // multiple matches from the same line collapse to one entry keyed by
  // rootKey:gen. In newOnly mode we collapse all matches into a single
  // section anchored at dex.generation (no sub-buckets — only chain-mates
  // from other gens get muted/badged).
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
      // matchedIds = placed + matching + not excluded + belongs to this gen bucket.
      // mutedIds = anyone not matching / excluded / from a different gen.
      // Members matching + right-gen but not placed stay full-opacity context.
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

  // Build sections. In newOnly mode, collapse to a single section; otherwise
  // one section per gen, sorted by gen number.
  const genColors = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];
  const sections: SectionGroup[] = [];
  if (newOnly) {
    const groups = evoLinesByGen.get(anchorGenForNewOnly) ?? [];
    groups.sort((a, b) => a.members[0].id - b.members[0].id);
    if (groups.length > 0) {
      sections.push({
        sectionId: `gen-${anchorGenForNewOnly}`,
        sectionName: `Generation ${anchorGenForNewOnly}`,
        sectionColor: genColors[(anchorGenForNewOnly - 1) % genColors.length],
        groups,
      });
    }
  } else {
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

/** Cache for national-dex type matchup drilldowns. The national dex's
 *  matchup data depends only on (type, excludeSpecial) — storeSections
 *  only matters for which Pokemon are "placed", but the heavy work
 *  (matchup computation + evo-line grouping) stays the same. We cache
 *  the expensive structural result and patch in the live placedIds at
 *  read time by storing a factory that accepts the current storeSections. */
const _nationalMatchupCache = new Map<string, DrillDownData>();

/** Type matchup drilldown: group Pokemon by their matchup score tier against the attacking type.
 *  Supports regional dex context — when dexId is set, shows that dex's Pokemon instead of user's. */
function computeTypeMatchupDrillDown(
  segment: DrillDownSegment & { kind: 'typeMatchup' },
  storeSections: Record<string, number[]>,
  excludeSpecial: boolean,
  dexId: string | null,
  newOnly: boolean,
): DrillDownData | null {
  const userPlacedIds = new Set(Object.values(storeSections).flat());
  const isRegional = dexId !== null && dexId !== 'yours';

  // For regional/national dex, the matchup data depends only on (type,
  // dexId, excludeSpecial, newOnly) — not on storeSections (which only
  // affects branch preference in multi-branch evo lines like Eevee).
  // Cache the expensive result so swiping between types is instant.
  if (isRegional) {
    const cacheKey = `${segment.type}|${dexId}|${excludeSpecial}|${newOnly}`;
    const cached = _nationalMatchupCache.get(cacheKey);
    if (cached) return cached;
  }

  // Predicate for "excluded" — what counts as a starter differs between
  // contexts: in a regional/national dex we use the global STARTER_IDS list;
  // in the user's build we use whatever they placed in the starter section.
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

  // Excluded pokemon stay in the drilldown as muted context rather than
  // being removed. Their matchup scores aren't shown as "own" tier members,
  // but they still appear within their evolution line.
  const excludedIds = new Set<number>();
  for (const p of pokemon) if (isExcluded(p)) excludedIds.add(p.id);
  const placedIdSet = isRegional ? userPlacedIds : new Set(pokemon.map(p => p.id));

  // Compute per-pokemon matchup scores
  const matchups = computePerPokemonMatchup(segment.type as TypeName, pokemon);

  // Store per-pokemon offense/defense for chip display
  const matchupInfo = new Map<number, { offense: number; defense: number; bestDefenseType: TypeName }>();

  // Group by integer-floored score tier (skip tier 0 — evenly matched).
  // Excluded pokemon are kept out of tier buckets (they don't contribute to
  // the tier count) but their matchupInfo is still populated so they can
  // render as muted context within evo lines anchored by a non-excluded tier
  // member.
  const tierMap = new Map<number, Set<number>>();
  const matchupById = new Map<number, number>();
  for (const m of matchups) {
    matchupInfo.set(m.pokemon.id, { offense: m.offense, defense: m.defense, bestDefenseType: m.bestDefenseType });
    const tier = Math.floor(m.matchup);
    if (tier === 0) continue; // filter out evenly matched
    matchupById.set(m.pokemon.id, m.matchup);
    if (excludedIds.has(m.pokemon.id)) continue;
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
    // U+002B (+) and U+2212 (−) are the same width in proportional fonts
    const label = tier > 0
      ? `+${tier} ${tier === 1 ? 'doubling' : 'doublings'} of advantage`
      : `\u2212${Math.abs(tier)} ${Math.abs(tier) === 1 ? 'doubling' : 'doublings'} of advantage`;
    const color = tierColors.get(tier) ?? (tier > 0 ? '#15803d' : '#991b1b');
    const meta = { label, color };

    // Build evolution line groups, sorted by matchup score descending
    const seenRoots = new Set<string>();
    const groups: { key: string; members: Pokemon[]; matchedIds: Set<number>; mutedIds?: Set<number> }[] = [];

    // Sort Pokemon in this tier by matchup descending
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
      // Compute matchup info for evo line members not in the filtered set
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
    title: dexLabel ? `${title} — ${dexLabel}` : title,
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
  // Cache regional/national results for instant access on re-visit
  if (isRegional) {
    const cacheKey = `${segment.type}|${dexId}|${excludeSpecial}|${newOnly}`;
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
      return true; // all pokemon shown, grouped by score tier
    case 'shape':
      return p.shape === segment.shape;
  }
}

/** "Single" / "Double" / "Triple" as a translatable word, not an array index. */
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
      // No header icon (like the gen drilldown): the HOME silhouettes are black
      // and would vanish on the dark-mode header. The title carries it.
      return {
        title: t('drilldown.shapeTitle', { shape: shapeLabel(segment.shape as ShapeName) }),
        color: '#ef4444', // app red — shapes carry no per-category color
      };
  }
}
