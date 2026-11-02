import { mergeEvolutionBranches } from './chainMerge';
import type { BrowserStoreState } from './browserStore';
import { getPokemonById, type EvolutionGroup, type PokemonDataSource, type PokemonFilterOptions } from '@/hooks/usePokemonData';
import { ARCHETYPES } from '@/data/archetypes';
import { BUILD_GROUPS } from '@/data/slot-template';
import { CATEGORIES, type PokemonCategory } from '@/data/categories';
import type { Pokemon } from '@/types/pokemon';
import { archetypeSubgroupLabel, categorySubgroupLabel, sectionName as sectionLabel, t } from '@/i18n';

export interface BrowserSubgroup {
  label: string;
  pokemonIds: number[];
  shinyIds?: number[];
  order?: 'evoLine';
  lines?: number[][];
}

export interface SubgroupGridGroup {
  key: string;
  members: Pokemon[];
  matchedIds: Set<number>;
}

export interface GridModel {
  label: string;
  dualCols?: NonNullable<PokemonCategory['dualColumns']>;
  groups?: SubgroupGridGroup[];
  leftGroups?: SubgroupGridGroup[];
  rightGroups?: SubgroupGridGroup[];
  shinyIds?: Set<number>;
  spriteOverrides?: Record<number, string>;
}

export function gridDefinitions(options: Pick<PokemonFilterOptions, 'category' | 'archetype'>) {
  const gridCategoryDef = options.category
    ? CATEGORIES.find((c) => c.id === options.category)
    : null;
  const gridArchetypeDef = options.archetype
    ? ARCHETYPES.find((a) => a.id === options.archetype)
    : null;
  return { gridCategoryDef, gridArchetypeDef };
}

export interface GridInputs extends ReturnType<typeof gridDefinitions>, Pick<BrowserStoreState,
  'scopeFilter' | 'restrictIds' | 'scopeFilterLabel' | 'scopeFilterLines' | 'myDexFilter' | 'myDexSections' | 'standaloneTiles'> {
  groups: EvolutionGroup[];
  dataSource?: PokemonDataSource;
}

function scopeSubgroup({ scopeFilter, restrictIds, scopeFilterLabel, scopeFilterLines }: GridInputs, ids: Iterable<number>): BrowserSubgroup[] | null {
  const scopedToLines = !!(scopeFilterLines && (scopeFilter || restrictIds));
  if (!scopedToLines) return null;
  const inScope = [...ids].filter((id) => scopeFilterLines.some((line) => line.includes(id)));
  if (inScope.length === 0) return [];
  return [{
    label: scopeFilterLabel ?? t('browser.scope'),
    pokemonIds: inScope,
    order: 'evoLine',
    lines: scopeFilterLines,
  }];
}

function sectionSubgroups({ myDexFilter, myDexSections }: GridInputs, ids: Iterable<number>): BrowserSubgroup[] | null {
  if (!myDexFilter || !myDexSections) return null;
  const inResults = new Set(ids);
  return BUILD_GROUPS
    .map((g) => ({
      label: sectionLabel(g.id),
      pokemonIds: (myDexSections[g.id] ?? []).filter((id) => inResults.has(id)),
    }))
    .filter((sub) => sub.pokemonIds.length > 0);
}

export function browseSubgroups(inputs: GridInputs): BrowserSubgroup[] {
  const { groups, gridArchetypeDef, gridCategoryDef, dataSource } = inputs;
  const lookupPokemon = dataSource?.getPokemonById ?? getPokemonById;
  if (gridArchetypeDef?.subgroups) {
    return gridArchetypeDef.subgroups.map((sub, i) => ({ ...sub, label: archetypeSubgroupLabel(gridArchetypeDef.id, i) }));
  }
  if (gridCategoryDef?.subgroups) {
    return gridCategoryDef.subgroups.map((sub, i) => ({ ...sub, label: categorySubgroupLabel(gridCategoryDef.id, i) }));
  }

  const sourceIds = gridArchetypeDef
    ? gridArchetypeDef.pokemonIds
    : groups.flatMap(g => [...g.matchedIds]);

  const scoped = scopeSubgroup(inputs, sourceIds);
  if (scoped) return scoped;

  const bySection = sectionSubgroups(inputs, sourceIds);
  if (bySection) return bySection;

  const genMap = new Map<number, number[]>();
  for (const id of sourceIds) {
    const p = lookupPokemon(id);
    if (!p) continue;
    if (!genMap.has(p.generation)) genMap.set(p.generation, []);
    genMap.get(p.generation)!.push(id);
  }

  return [...genMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gen, ids]) => ({ label: t('browser.subgroupGeneration', { gen }), pokemonIds: ids }));
}

export function searchResultSubgroups(inputs: GridInputs): BrowserSubgroup[] {
  const { groups } = inputs;
  const memberIds = groups.flatMap((g) => g.members.map((m) => m.id));
  const scoped = scopeSubgroup(inputs, memberIds);
  if (scoped) return scoped;
  const bySection = sectionSubgroups(inputs, memberIds);
  if (bySection) return bySection;
  const genMap = new Map<number, number[]>();
  for (const g of groups) {
    for (const m of g.members) {
      if (!genMap.has(m.generation)) genMap.set(m.generation, []);
      genMap.get(m.generation)!.push(m.id);
    }
  }
  return [...genMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gen, ids]) => ({ label: t('browser.subgroupGeneration', { gen }), pokemonIds: [...new Set(ids)] }));
}

export function gridModels(source: BrowserSubgroup[], isSearching: boolean, inputs: GridInputs): GridModel[] {
  const { groups, gridArchetypeDef, gridCategoryDef, standaloneTiles, dataSource } = inputs;
  const lookupPokemon = dataSource?.getPokemonById ?? getPokemonById;
  const shinyIds = gridArchetypeDef?.shinyIds ? new Set(gridArchetypeDef.shinyIds) : undefined;
  const spriteOverrides = gridArchetypeDef?.spriteOverrides;
  const compareBrowserOrder = dataSource?.compareBrowserOrder ?? ((a: number, b: number) => a - b);
  const dualCols = !isSearching ? gridCategoryDef?.dualColumns : undefined;
  const models: GridModel[] = [];

  const claimedPokemonIds = standaloneTiles ? new Set<number>() : null;

  for (const sub of source) {
    const subIdSet = new Set(sub.pokemonIds);
    const inheritedMemberId = !isSearching && !sub.lines && (gridArchetypeDef || gridCategoryDef?.subgroups || dualCols)
      ? dataSource?.archetypeMemberId
      : undefined;
    const matchesMember = (ids: Set<number>, id: number) => ids.has(id) || ids.has(inheritedMemberId?.(id) ?? id);

    if (sub.lines) {
      const drawn = sub.lines
        .map((line) => line.map((id) => lookupPokemon(id)).filter((p): p is Pokemon => !!p))
        .filter((members) => members.length > 0 && members.some((m) => subIdSet.has(m.id)))
        .map((members) => {
          let gen = Infinity;
          let first = Infinity;
          for (const m of members) {
            if (m.generation < gen) gen = m.generation;
            if (m.id < first) first = m.id;
          }
          return { members, gen, first };
        })
        .sort((a, b) => a.gen - b.gen || a.first - b.first)
        .map(({ members }) => ({
          key: `${sub.label}-${members.map((m) => m.id).join('-')}`,
          members,
          matchedIds: new Set(members.filter((m) => subIdSet.has(m.id)).map((m) => m.id)),
        }));
      if (drawn.length > 0) models.push({ label: sub.label, groups: drawn });
      continue;
    }

    let matching = groups.filter(g => g.members.some(m => matchesMember(subIdSet, m.id)));
    if (matching.length === 0) continue;
    if (claimedPokemonIds) {
      matching = mergeEvolutionBranches(matching, dataSource?.standaloneGroupId).flatMap((group) => {
        const members = group.members.filter(member => matchesMember(subIdSet, member.id) && !claimedPokemonIds.has(member.id));
        for (const member of members) claimedPokemonIds.add(member.id);
        return members.length > 0 ? [{ ...group, members }] : [];
      });
      if (matching.length === 0) continue;
    }

    if (!isSearching && gridArchetypeDef) {
      const orderIdx = new Map<EvolutionGroup, number>();
      for (const g of matching) {
        orderIdx.set(g, sub.pokemonIds.findIndex(id => g.members.some(m => m.id === id || inheritedMemberId?.(m.id) === id)));
      }
      matching.sort((a, b) => orderIdx.get(a)! - orderIdx.get(b)!);
    } else if (sub.order === 'evoLine') {
      const key = new Map<EvolutionGroup, [number, number]>();
      for (const g of matching) {
        let gen = Infinity;
        let id = Infinity;
        for (const m of g.members) {
          if (m.generation < gen) gen = m.generation;
          if (id === Infinity || compareBrowserOrder(m.id, id) < 0) id = m.id;
        }
        key.set(g, [gen, id]);
      }
      matching.sort((a, b) => key.get(a)![0] - key.get(b)![0] || compareBrowserOrder(key.get(a)![1], key.get(b)![1]));
    } else {
      const minId = new Map<EvolutionGroup, number>();
      for (const g of matching) {
        let min = Infinity;
        for (const m of g.members) {
          if (matchesMember(subIdSet, m.id) && (min === Infinity || compareBrowserOrder(m.id, min) < 0)) min = m.id;
        }
        minId.set(g, min);
      }
      matching.sort((a, b) => compareBrowserOrder(minId.get(a)!, minId.get(b)!));
    }

    const mapGroup = (group: EvolutionGroup): SubgroupGridGroup => ({
      key: `${sub.label}-${group.members.map(member => member.id).join('-')}`,
      members: group.members,
      matchedIds: new Set(group.members.filter(m => matchesMember(subIdSet, m.id)).map(m => m.id)),
    });

    if (dualCols) {
      const leftIdSet = new Set(dualCols.left.ids);
      const rightIdSet = new Set(dualCols.right.ids);
      models.push({
        label: sub.label,
        dualCols,
        leftGroups: matching.filter(g => g.members.some(m => matchesMember(leftIdSet, m.id))).map(mapGroup),
        rightGroups: matching.filter(g => g.members.some(m => matchesMember(rightIdSet, m.id))).map(mapGroup),
      });
    } else {
      models.push({
        label: sub.label,
        groups: matching.map(mapGroup),
        shinyIds: isSearching ? undefined : (sub.shinyIds ? new Set(sub.shinyIds) : shinyIds),
        spriteOverrides: isSearching ? undefined : spriteOverrides,
      });
    }
  }
  return models;
}
