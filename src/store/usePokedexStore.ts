import '../lib/visitorAtBoot';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createEmptySections, BUILD_GROUP_IDS } from '@/data/slot-template';
import { MILESTONES, milestonesAtOrBelow } from '@/lib/milestones';
import { getEvolutionChainIds, getEvolutionLine, getDescendantIds, getPokemonById, computeRemovalCascade, getExclusiveForms } from '@/hooks/usePokemonData';
import { DEMO_MODE, SPANDREL_DEMO, POKEDEX_STORAGE_KEY } from '@/lib/demoMode';
import type { Locale } from '@/i18n';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { SPANDREL_SEED_SECTIONS } from '@/data/spandrelSeed';

function getBaseForm(pokemonId: number): number {
  let current = getPokemonById(pokemonId);
  while (current?.evolvesFrom) {
    const ancestor = getPokemonById(current.evolvesFrom);
    if (!ancestor) break;
    current = ancestor;
  }
  return current?.id ?? pokemonId;
}

function getStarterSortPriority(pokemonId: number): number {
  const baseId = getBaseForm(pokemonId);
  const base = getPokemonById(baseId);
  if (!base?.types?.length) return 4;

  const types = base.types;
  const primaryType = types[0];
  const secondaryType = types[1];

  if (primaryType === 'grass') return 1;
  if (primaryType === 'fire') return 2;
  if (primaryType === 'water') return 3;

  if (secondaryType === 'grass') return 1;
  if (secondaryType === 'fire') return 2;
  if (secondaryType === 'water') return 3;

  return 4;
}

function initialSections(): Record<string, number[]> {
  const base = createEmptySections();
  const seed = SPANDREL_DEMO ? SPANDREL_SEED_SECTIONS : DEMO_MODE ? DEMO_DEX_SECTIONS : null;
  if (seed) for (const [g, ids] of Object.entries(seed)) base[g] = [...ids];
  return base;
}

const INITIAL_SECTIONS = initialSections();
const INITIAL_COUNT = Object.values(INITIAL_SECTIONS).reduce((s, a) => s + a.length, 0);

type TypeFilterMode = 'any' | 'all';

export type ViewSortOption = 'regional' | 'national' | 'type' | 'build-order' | 'custom';

export type DrillDownSegment =
  | { kind: 'type'; type: string }
  | { kind: 'generation'; generation: number }
  | { kind: 'stage'; lineLength: number; stage: number }
  | { kind: 'stageAll'; stage: number }
  | { kind: 'lineLength'; lineLength: number }
  | { kind: 'evoLevel'; binStart: number; binEnd: number }
  | { kind: 'bst'; binStart: number; binEnd: number }
  | { kind: 'typeMatchup'; type: string }
  | { kind: 'shape'; shape: string };

interface PokedexState {
  sections: Record<string, number[]>;
  activeSection: string | null;
  activeCategoryFilter: string | null;
  activeArchetypeFilter: string | null;
  searchQuery: string;
  typeFilter: string[] | null;
  typeFilterMode: TypeFilterMode;
  generationFilter: number[] | null;
  shapeFilter: string[] | null;
  colorFilter: string[] | null;
  eggGroupFilter: string[] | null;
  evoLineSizeFilter: number[] | null;
  mobileBrowserOpen: boolean;
  drillDownSegment: DrillDownSegment | null;
  drillDownPeek: boolean;
  drillDownSiblings: DrillDownSegment[];
  drillDownExcludeSpecial: boolean;
  drillDownDexId: string | null;
  drillDownNewOnly: boolean;
  whatsAdvisorExpanded: boolean;
  viewSortOption: ViewSortOption;
  viewGroupSpecialAtEnd: boolean;
  viewCustomOrder: number[] | null;
  viewShowSections: boolean;
  viewShowStats: boolean;

  milestoneMax: number;
  milestoneCelebrated: number[];
  milestoneCelebration: number | null;
  locale: Locale | null;
  localeNoticeSeen: boolean;
  statsHintArmed: boolean;
  exportHintArmed: boolean;

  addToSection: (sectionId: string, pokemonIds: number[]) => void;
  removeBranch: (sectionId: string, pokemonId: number) => void;
  removeEvoLine: (sectionId: string, pokemonId: number) => void;
  moveEvoLine: (fromSection: string, evoLineIds: number[], toSection: string, insertBeforeIndex: number) => void;
  reorderSection: (groupId: string, orderedIds: number[]) => void;
  setActiveSection: (sectionId: string | null) => void;
  clearAll: () => void;
  setMobileBrowserOpen: (open: boolean) => void;
  setCategoryFilter: (category: string | null) => void;
  setArchetypeFilter: (archetype: string | null) => void;
  setSearchQuery: (query: string) => void;
  setTypeFilter: (types: string[] | null) => void;
  setTypeFilterMode: (mode: TypeFilterMode) => void;
  toggleType: (type: string) => void;
  setGenerationFilter: (gens: number[] | null) => void;
  toggleGeneration: (gen: number) => void;
  setShapeFilter: (shapes: string[] | null) => void;
  toggleShape: (shape: string) => void;
  setColorFilter: (colors: string[] | null) => void;
  toggleColor: (color: string) => void;
  setEggGroupFilter: (groups: string[] | null) => void;
  toggleEggGroup: (group: string) => void;
  setEvoLineSizeFilter: (sizes: number[] | null) => void;
  resetBrowserFilters: () => void;
  openDrillDown: (segment: DrillDownSegment, siblings?: DrillDownSegment[], excludeSpecial?: boolean, dexId?: string | null, newOnly?: boolean) => void;
  expandDrillDown: () => void;
  closeDrillDown: () => void;
  navigateDrillDown: (segment: DrillDownSegment) => void;
  setWhatsAdvisorExpanded: (expanded: boolean) => void;
  setLocale: (locale: Locale | null) => void;
  setLocaleNoticeSeen: (seen: boolean) => void;
  setViewSortOption: (option: ViewSortOption) => void;
  setViewGroupSpecialAtEnd: (value: boolean) => void;
  setViewCustomOrder: (order: number[] | null) => void;
  setViewShowSections: (value: boolean) => void;
  setViewShowStats: (value: boolean) => void;
  recordPlacedCount: (count: number) => void;
  dismissMilestoneCelebration: () => void;
  armStatsHint: () => void;
  dismissStatsHint: () => void;
  armExportHint: () => void;
  dismissExportHint: () => void;
}

const GROUP_ID_SET = new Set(BUILD_GROUP_IDS);

const NO_BROWSER_FILTERS = {
  activeCategoryFilter: null,
  activeArchetypeFilter: null,
  searchQuery: '',
  typeFilter: null,
  typeFilterMode: 'any',
  generationFilter: null,
  shapeFilter: null,
  colorFilter: null,
  eggGroupFilter: null,
  evoLineSizeFilter: null,
} satisfies Partial<PokedexState>;

export const usePokedexStore = create<PokedexState>()(
  persist(
    (set, get) => ({
      sections: INITIAL_SECTIONS,
      activeSection: null,
      ...NO_BROWSER_FILTERS,
      mobileBrowserOpen: false,
      drillDownSegment: null,
      drillDownPeek: true,
      drillDownSiblings: [],
      drillDownExcludeSpecial: false,
      drillDownDexId: null,
      drillDownNewOnly: false,
      whatsAdvisorExpanded: true,
      viewSortOption: 'build-order' as ViewSortOption,
      viewGroupSpecialAtEnd: true,
      viewCustomOrder: null,
      viewShowSections: DEMO_MODE,
      viewShowStats: false,
      milestoneMax: INITIAL_COUNT,
      milestoneCelebrated: milestonesAtOrBelow(INITIAL_COUNT),
      milestoneCelebration: null,
      statsHintArmed: false,
      exportHintArmed: false,
      locale: null,
      localeNoticeSeen: false,

      addToSection: (sectionId, pokemonIds) =>
        set((state) => {
          const placedIds = new Set(pokemonIds);
          const allIds: number[] = [];
          const seen = new Set<number>();
          for (const id of pokemonIds) {
            const line = getEvolutionLine(id, placedIds);
            for (const p of line) {
              if (!seen.has(p.id)) {
                seen.add(p.id);
                allIds.push(p.id);
              }
            }
          }

          const newSections = { ...state.sections };
          const addingSet = new Set(allIds);

          const exclusiveRemovals = new Set<number>();
          for (const id of allIds) {
            for (const excId of getExclusiveForms(id)) {
              exclusiveRemovals.add(excId);
            }
          }

          for (const sid of BUILD_GROUP_IDS) {
            if (sid !== sectionId && newSections[sid]) {
              newSections[sid] = newSections[sid].filter((id) => !addingSet.has(id) && !exclusiveRemovals.has(id));
            }
          }
          if (exclusiveRemovals.size > 0) {
            newSections[sectionId] = (newSections[sectionId] ?? []).filter((id) => !exclusiveRemovals.has(id));
          }

          const existing = newSections[sectionId] ?? [];
          const existingSet = new Set(existing);
          const trulyNew = allIds.filter(id => !existingSet.has(id));

          if (trulyNew.length === 0) {
            return { sections: newSections };
          }

          let result = [...existing];
          for (const newId of trulyNew) {
            const chainIds = new Set(getEvolutionChainIds(newId));
            const ancestors = new Set<number>();
            let cur = getPokemonById(newId);
            while (cur?.evolvesFrom) {
              ancestors.add(cur.evolvesFrom);
              cur = getPokemonById(cur.evolvesFrom);
            }
            const descendants = new Set(getDescendantIds(newId).slice(1));

            let insertAfter = -1;
            let insertBefore = result.length;

            for (let i = 0; i < result.length; i++) {
              const id = result[i];
              if (ancestors.has(id)) {
                insertAfter = Math.max(insertAfter, i);
              } else if (descendants.has(id)) {
                insertBefore = Math.min(insertBefore, i);
              } else if (chainIds.has(id)) {
                insertAfter = Math.max(insertAfter, i);
              }
            }

            const insertAt = insertAfter === -1
              ? result.length
              : Math.min(insertAfter + 1, insertBefore);
            result = [...result.slice(0, insertAt), newId, ...result.slice(insertAt)];
          }

          if (sectionId === 'starter' && allIds.some(id => getStarterSortPriority(id) < 4)) {
            const sortablePriorities: Record<number, number[]> = { 1: [], 2: [], 3: [] };
            const unsortable: number[] = [];

            for (const id of result) {
              const priority = getStarterSortPriority(id);
              if (priority < 4) {
                sortablePriorities[priority].push(id);
              } else {
                unsortable.push(id);
              }
            }

            result = [...unsortable, ...sortablePriorities[1], ...sortablePriorities[2], ...sortablePriorities[3]];
          }

          newSections[sectionId] = result;
          return { sections: newSections };
        }),

      removeBranch: (sectionId, pokemonId) =>
        set((state) => {
          const sectionIds = state.sections[sectionId] ?? [];
          const removeSet = computeRemovalCascade(pokemonId, sectionIds);
          const newSections = { ...state.sections };
          newSections[sectionId] = sectionIds.filter((id) => !removeSet.has(id));
          return { sections: newSections };
        }),

      removeEvoLine: (sectionId, pokemonId) =>
        set((state) => {
          const line = getEvolutionLine(pokemonId);
          const removeSet = new Set(line.map((p) => p.id));
          const newSections = { ...state.sections };
          if (newSections[sectionId]) {
            newSections[sectionId] = newSections[sectionId].filter((id) => !removeSet.has(id));
          }
          return { sections: newSections };
        }),

      moveEvoLine: (fromSection, evoLineIds, toSection, insertBeforeIndex) =>
        set((state) => {
          const removeSet = new Set(evoLineIds);
          const newSections = { ...state.sections };
          if (newSections[fromSection]) {
            newSections[fromSection] = newSections[fromSection].filter((id) => !removeSet.has(id));
          }
          if (!newSections[toSection]) newSections[toSection] = [];
          const dest = [...newSections[toSection]];
          dest.splice(insertBeforeIndex, 0, ...evoLineIds);
          newSections[toSection] = dest;
          return { sections: newSections };
        }),

      reorderSection: (groupId, orderedIds) =>
        set((state) => {
          const current = state.sections[groupId];
          if (!current || current.length !== orderedIds.length) return {};
          const remaining = new Map<number, number>();
          for (const id of current) {
            remaining.set(id, (remaining.get(id) ?? 0) + 1);
          }
          for (const id of orderedIds) {
            const count = remaining.get(id) ?? 0;
            if (count === 0) return {};
            remaining.set(id, count - 1);
          }
          return { sections: { ...state.sections, [groupId]: [...orderedIds] } };
        }),

      setActiveSection: (sectionId) => set({ activeSection: sectionId }),

      clearAll: () => set({ sections: createEmptySections() }),

      setMobileBrowserOpen: (open) => set({ mobileBrowserOpen: open }),

      setCategoryFilter: (category) => set({ activeCategoryFilter: category, activeArchetypeFilter: category ? null : get().activeArchetypeFilter }),

      setArchetypeFilter: (archetype) => set({ activeArchetypeFilter: archetype, activeCategoryFilter: archetype ? null : get().activeCategoryFilter }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setTypeFilter: (types) => set({ typeFilter: types }),

      setTypeFilterMode: (mode) => set({ typeFilterMode: mode }),

      toggleType: (type) => set((state) => {
        const current = state.typeFilter ?? [];
        const next = current.includes(type)
          ? current.filter(t => t !== type)
          : [...current, type];
        return { typeFilter: next.length > 0 ? next : null };
      }),

      setGenerationFilter: (gens) => set({ generationFilter: gens }),

      toggleGeneration: (gen) => set((state) => {
        const current = state.generationFilter ?? [];
        const next = current.includes(gen)
          ? current.filter(g => g !== gen)
          : [...current, gen];
        return { generationFilter: next.length > 0 ? next : null };
      }),

      setShapeFilter: (shapes) => set({ shapeFilter: shapes }),

      toggleShape: (shape) => set((state) => {
        const current = state.shapeFilter ?? [];
        const next = current.includes(shape)
          ? current.filter(s => s !== shape)
          : [...current, shape];
        return { shapeFilter: next.length > 0 ? next : null };
      }),

      setColorFilter: (colors) => set({ colorFilter: colors }),

      toggleColor: (color) => set((state) => {
        const current = state.colorFilter ?? [];
        const next = current.includes(color)
          ? current.filter(c => c !== color)
          : [...current, color];
        return { colorFilter: next.length > 0 ? next : null };
      }),

      setEggGroupFilter: (groups) => set({ eggGroupFilter: groups }),

      toggleEggGroup: (group) => set((state) => {
        const current = state.eggGroupFilter ?? [];
        const next = current.includes(group)
          ? current.filter(g => g !== group)
          : [...current, group];
        return { eggGroupFilter: next.length > 0 ? next : null };
      }),

      setEvoLineSizeFilter: (sizes) => set({ evoLineSizeFilter: sizes }),

      resetBrowserFilters: () => set(NO_BROWSER_FILTERS),

      openDrillDown: (segment, siblings, excludeSpecial, dexId, newOnly) => set({ drillDownSegment: segment, drillDownPeek: true, drillDownSiblings: siblings ?? [], drillDownExcludeSpecial: excludeSpecial ?? false, drillDownDexId: dexId ?? null, drillDownNewOnly: newOnly ?? false }),
      expandDrillDown: () => set({ drillDownPeek: false }),
      closeDrillDown: () => set({ drillDownSegment: null, drillDownPeek: true, drillDownSiblings: [], drillDownExcludeSpecial: false, drillDownDexId: null, drillDownNewOnly: false }),
      navigateDrillDown: (segment) => set({ drillDownSegment: segment }),
      setWhatsAdvisorExpanded: (expanded) => set({ whatsAdvisorExpanded: expanded }),
      setLocale: (locale) => set({ locale }),
      setLocaleNoticeSeen: (seen) => set({ localeNoticeSeen: seen }),
      setViewSortOption: (option) => set({ viewSortOption: option }),
      setViewGroupSpecialAtEnd: (value) => set({ viewGroupSpecialAtEnd: value }),
      setViewCustomOrder: (order) => set({ viewCustomOrder: order }),
      setViewShowSections: (value) => set({ viewShowSections: value }),
      setViewShowStats: (value) => set({ viewShowStats: value }),

      recordPlacedCount: (count) =>
        set((state) => {
          const milestoneMax = Math.max(state.milestoneMax, count);
          const fresh = MILESTONES.filter(
            (m) => count >= m && !state.milestoneCelebrated.includes(m),
          );
          if (fresh.length === 0) {
            return milestoneMax !== state.milestoneMax ? { milestoneMax } : {};
          }
          return {
            milestoneMax,
            milestoneCelebrated: [...state.milestoneCelebrated, ...fresh],
            milestoneCelebration: Math.max(...fresh),
          };
        }),

      dismissMilestoneCelebration: () => set({ milestoneCelebration: null }),
      armStatsHint: () => set({ statsHintArmed: true }),
      dismissStatsHint: () => set({ statsHintArmed: false }),
      armExportHint: () => set({ exportHintArmed: true }),
      dismissExportHint: () => set({ exportHintArmed: false }),
    }),
    {
      name: POKEDEX_STORAGE_KEY,
      partialize: (state) => ({ sections: state.sections, whatsAdvisorExpanded: state.whatsAdvisorExpanded, viewSortOption: state.viewSortOption, viewGroupSpecialAtEnd: state.viewGroupSpecialAtEnd, viewCustomOrder: state.viewCustomOrder, viewShowSections: state.viewShowSections, milestoneMax: state.milestoneMax, milestoneCelebrated: state.milestoneCelebrated, locale: state.locale, localeNoticeSeen: state.localeNoticeSeen }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as {
          sections?: Record<string, number[]>;
          whatsAdvisorExpanded?: boolean;
          viewSortOption?: ViewSortOption;
          viewGroupSpecialAtEnd?: boolean;
          viewCustomOrder?: number[] | null;
          viewShowSections?: boolean;
          milestoneMax?: number;
          milestoneCelebrated?: number[];
          locale?: Locale | null;
          localeNoticeSeen?: boolean;
        };

        const result = { ...state };

        if (version < 3 && result.sections) {
          const hasOldKeys = Object.keys(result.sections).some(k => !GROUP_ID_SET.has(k));
          if (hasOldKeys) {
            const newSections = createEmptySections();
            const allIds = Object.values(result.sections).flat();
            newSections['other'] = allIds;
            result.sections = newSections;
          }
        }

        if (result.sections) {
          result.sections = { ...createEmptySections(), ...result.sections };
        } else {
          result.sections = createEmptySections();
        }

        if (result.whatsAdvisorExpanded === undefined) {
          result.whatsAdvisorExpanded = true;
        }
        if (result.viewSortOption === undefined) {
          result.viewSortOption = 'build-order';
        }

        if (result.viewGroupSpecialAtEnd === undefined) {
          result.viewGroupSpecialAtEnd = true;
        }

        if (result.viewCustomOrder === undefined) {
          result.viewCustomOrder = null;
        }

        const r = result as Record<string, unknown>;
        delete r.viewTitleOpacity;
        delete r.viewRepeatTitles;
        delete r.viewTitleVBias;
        delete r.viewShortenTitles;
        delete r.viewOutlineWidth;

        if (result.milestoneMax === undefined || result.milestoneCelebrated === undefined) {
          const count = Object.values(result.sections ?? {}).reduce((s, a) => s + a.length, 0);
          result.milestoneMax = count;
          result.milestoneCelebrated = milestonesAtOrBelow(count);
        }

        if (result.locale === undefined) result.locale = null;
        if (result.localeNoticeSeen === undefined) result.localeNoticeSeen = false;

        return result;
      },
      version: 10,
    }
  )
);
