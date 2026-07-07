import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createEmptySections, BUILD_GROUP_IDS } from '@/data/slot-template';
import { getEvolutionChainIds, getEvolutionLine, getDescendantIds, getPokemonById, computeRemovalCascade, getExclusiveForms } from '@/hooks/usePokemonData';
import { DEMO_MODE, SPANDREL_DEMO, POKEDEX_STORAGE_KEY } from '@/lib/demoMode';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { SPANDREL_SEED_SECTIONS } from '@/data/spandrelSeed';

/** Initial sections — empty for real users, the sample dex in demo mode, or the
 *  spandrel test fixture when ?demo=spandrels is set. */
function initialSections(): Record<string, number[]> {
  const base = createEmptySections();
  const seed = SPANDREL_DEMO ? SPANDREL_SEED_SECTIONS : DEMO_MODE ? DEMO_DEX_SECTIONS : null;
  if (seed) for (const [g, ids] of Object.entries(seed)) base[g] = [...ids];
  return base;
}

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
  | { kind: 'typeMatchup'; type: string };

interface PokedexState {
  sections: Record<string, number[]>; // groupId -> ordered pokemon IDs
  activeSection: string | null; // which group the user is adding to
  activeCategoryFilter: string | null;
  activeArchetypeFilter: string | null;
  searchQuery: string;
  typeFilter: string[] | null; // multi-select types
  typeFilterMode: TypeFilterMode; // 'any' = OR, 'all' = AND (dual-type)
  generationFilter: number[] | null; // multi-select generations
  shapeFilter: string[] | null; // multi-select body shapes (dex shape groups)
  evoLineSizeFilter: number[] | null; // [1], [2], [3] where 3 means 3+
  mobileBrowserOpen: boolean;
  drillDownSegment: DrillDownSegment | null;
  drillDownPeek: boolean;
  drillDownSiblings: DrillDownSegment[]; // ordered list of all segments in the same chart
  drillDownExcludeSpecial: boolean; // whether the chart's exclusion toggle was active
  drillDownDexId: string | null; // which regional dex the drilldown is for (null = "yours")
  drillDownNewOnly: boolean; // whether "gen X only" filter was active
  whatsAdvisorExpanded: boolean;
  viewSortOption: ViewSortOption;
  viewGroupSpecialAtEnd: boolean;
  /** User-defined order applied when viewSortOption === 'custom'.
   *  Null means no custom order has been created yet. */
  viewCustomOrder: number[] | null;
  /** Whether the build-section outlines overlay is shown on the View grid. */
  viewShowSections: boolean;
  /** Whether the detailed-stats side panel is shown on the View grid. */
  viewShowStats: boolean;

  // Actions
  addToSection: (sectionId: string, pokemonIds: number[]) => void;
  removeBranch: (sectionId: string, pokemonId: number) => void;
  removeEvoLine: (sectionId: string, pokemonId: number) => void;
  moveEvoLine: (fromSection: string, evoLineIds: number[], toSection: string, insertBeforeIndex: number) => void;
  /** Reorder a single build group's id list (must be a permutation of it). Used
   *  by the View page to apply an in-section drag without leaving build order. */
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
  setEvoLineSizeFilter: (sizes: number[] | null) => void;
  openDrillDown: (segment: DrillDownSegment, siblings?: DrillDownSegment[], excludeSpecial?: boolean, dexId?: string | null, newOnly?: boolean) => void;
  expandDrillDown: () => void;
  closeDrillDown: () => void;
  navigateDrillDown: (segment: DrillDownSegment) => void;
  setWhatsAdvisorExpanded: (expanded: boolean) => void;
  setViewSortOption: (option: ViewSortOption) => void;
  setViewGroupSpecialAtEnd: (value: boolean) => void;
  setViewCustomOrder: (order: number[] | null) => void;
  setViewShowSections: (value: boolean) => void;
  setViewShowStats: (value: boolean) => void;
}

const GROUP_ID_SET = new Set(BUILD_GROUP_IDS);

export const usePokedexStore = create<PokedexState>()(
  persist(
    (set, get) => ({
      sections: initialSections(),
      activeSection: null,
      activeCategoryFilter: null,
      activeArchetypeFilter: null,
      searchQuery: '',
      typeFilter: null,
      typeFilterMode: 'any' as TypeFilterMode,
      generationFilter: null,
      shapeFilter: null,
      evoLineSizeFilter: null,
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

      addToSection: (sectionId, pokemonIds) =>
        set((state) => {
          // Expand pokemonIds into full evo lines (only members in the batch)
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

          // Collect exclusive forms that must be removed when adding these pokemon
          const exclusiveRemovals = new Set<number>();
          for (const id of allIds) {
            for (const excId of getExclusiveForms(id)) {
              exclusiveRemovals.add(excId);
            }
          }

          // Remove from OTHER sections: duplicates and exclusive forms
          for (const sid of BUILD_GROUP_IDS) {
            if (sid !== sectionId && newSections[sid]) {
              newSections[sid] = newSections[sid].filter((id) => !addingSet.has(id) && !exclusiveRemovals.has(id));
            }
          }
          // Also remove exclusive forms from the TARGET section
          if (exclusiveRemovals.size > 0) {
            newSections[sectionId] = (newSections[sectionId] ?? []).filter((id) => !exclusiveRemovals.has(id));
          }

          // Merge into target section, preserving evo order.
          // Only insert IDs that aren't already there; for each, find the correct
          // insertion point: after all ancestors and parallel-branch chain members
          // already in the section, and before any descendants already there.
          const existing = newSections[sectionId] ?? [];
          const existingSet = new Set(existing);
          const trulyNew = allIds.filter(id => !existingSet.has(id));

          if (trulyNew.length === 0) {
            return { sections: newSections };
          }

          let result = [...existing];
          for (const newId of trulyNew) {
            const chainIds = new Set(getEvolutionChainIds(newId));
            // Ancestors: walk up evolvesFrom chain
            const ancestors = new Set<number>();
            let cur = getPokemonById(newId);
            while (cur?.evolvesFrom) {
              ancestors.add(cur.evolvesFrom);
              cur = getPokemonById(cur.evolvesFrom);
            }
            // Descendants: everything getDescendantIds returns except self
            const descendants = new Set(getDescendantIds(newId).slice(1));

            let insertAfter = -1;          // insert after this index
            let insertBefore = result.length; // insert before this index

            for (let i = 0; i < result.length; i++) {
              const id = result[i];
              if (ancestors.has(id)) {
                insertAfter = Math.max(insertAfter, i);
              } else if (descendants.has(id)) {
                insertBefore = Math.min(insertBefore, i);
              } else if (chainIds.has(id)) {
                // Parallel branch — append after existing chain members
                insertAfter = Math.max(insertAfter, i);
              }
            }

            // No chain relatives found → append at end; otherwise respect constraints
            const insertAt = insertAfter === -1
              ? result.length
              : Math.min(insertAfter + 1, insertBefore);
            result = [...result.slice(0, insertAt), newId, ...result.slice(insertAt)];
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
          // Remove from source
          if (newSections[fromSection]) {
            newSections[fromSection] = newSections[fromSection].filter((id) => !removeSet.has(id));
          }
          // Insert into destination at the specified index
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
          // Guard: only accept a true permutation of the group's current members.
          const curSet = new Set(current);
          for (const id of orderedIds) {
            if (!curSet.has(id)) return {};
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

      setEvoLineSizeFilter: (sizes) => set({ evoLineSizeFilter: sizes }),

      openDrillDown: (segment, siblings, excludeSpecial, dexId, newOnly) => set({ drillDownSegment: segment, drillDownPeek: true, drillDownSiblings: siblings ?? [], drillDownExcludeSpecial: excludeSpecial ?? false, drillDownDexId: dexId ?? null, drillDownNewOnly: newOnly ?? false }),
      expandDrillDown: () => set({ drillDownPeek: false }),
      closeDrillDown: () => set({ drillDownSegment: null, drillDownPeek: true, drillDownSiblings: [], drillDownExcludeSpecial: false, drillDownDexId: null, drillDownNewOnly: false }),
      navigateDrillDown: (segment) => set({ drillDownSegment: segment }),
      setWhatsAdvisorExpanded: (expanded) => set({ whatsAdvisorExpanded: expanded }),
      setViewSortOption: (option) => set({ viewSortOption: option }),
      setViewGroupSpecialAtEnd: (value) => set({ viewGroupSpecialAtEnd: value }),
      setViewCustomOrder: (order) => set({ viewCustomOrder: order }),
      setViewShowSections: (value) => set({ viewShowSections: value }),
      setViewShowStats: (value) => set({ viewShowStats: value }),
    }),
    {
      name: POKEDEX_STORAGE_KEY,
      partialize: (state) => ({ sections: state.sections, whatsAdvisorExpanded: state.whatsAdvisorExpanded, viewSortOption: state.viewSortOption, viewGroupSpecialAtEnd: state.viewGroupSpecialAtEnd, viewCustomOrder: state.viewCustomOrder, viewShowSections: state.viewShowSections }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as {
          sections?: Record<string, number[]>;
          whatsAdvisorExpanded?: boolean;
          viewSortOption?: ViewSortOption;
          viewGroupSpecialAtEnd?: boolean;
          viewCustomOrder?: number[] | null;
          viewShowSections?: boolean;
        };

        // Preserve all existing fields, only fix what needs fixing
        const result = { ...state };

        // v0/v1/v2 → v3: old section keys get merged into 'other'
        if (version < 3 && result.sections) {
          const hasOldKeys = Object.keys(result.sections).some(k => !GROUP_ID_SET.has(k));
          if (hasOldKeys) {
            const newSections = createEmptySections();
            const allIds = Object.values(result.sections).flat();
            newSections['other'] = allIds;
            result.sections = newSections;
          }
        }

        // Ensure all group keys exist in sections
        if (result.sections) {
          result.sections = { ...createEmptySections(), ...result.sections };
        } else {
          result.sections = createEmptySections();
        }

        // v3 → v4: new fields get defaults (no data loss)
        if (result.whatsAdvisorExpanded === undefined) {
          result.whatsAdvisorExpanded = true;
        }
        if (result.viewSortOption === undefined) {
          result.viewSortOption = 'build-order';
        }

        // v5 → v6: new view grouping toggle
        if (result.viewGroupSpecialAtEnd === undefined) {
          result.viewGroupSpecialAtEnd = true;
        }

        // v6 → v7: new custom order field
        if (result.viewCustomOrder === undefined) {
          result.viewCustomOrder = null;
        }

        // v7 → v8: title tuning knobs are no longer persisted — strip any stale
        // values so the (preview-only) code defaults take effect on load.
        const r = result as Record<string, unknown>;
        delete r.viewTitleOpacity;
        delete r.viewRepeatTitles;
        delete r.viewTitleVBias;
        delete r.viewShortenTitles;
        delete r.viewOutlineWidth;

        return result;
      },
      version: 8,
    }
  )
);
