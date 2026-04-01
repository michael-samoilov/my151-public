import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createEmptySections, BUILD_GROUP_IDS } from '@/data/slot-template';
import { getEvolutionLine, getDescendantIds, getPokemonById } from '@/hooks/usePokemonData';

type TypeFilterMode = 'any' | 'all';

export type DrillDownSegment =
  | { kind: 'type'; type: string }
  | { kind: 'generation'; generation: number }
  | { kind: 'stage'; lineLength: number; stage: number }
  | { kind: 'stageAll'; stage: number }
  | { kind: 'lineLength'; lineLength: number }
  | { kind: 'evoLevel'; binStart: number; binEnd: number }
  | { kind: 'bst'; binStart: number; binEnd: number };

interface PokedexState {
  sections: Record<string, number[]>; // groupId -> ordered pokemon IDs
  activeSection: string | null; // which group the user is adding to
  activeCategoryFilter: string | null;
  activeArchetypeFilter: string | null;
  searchQuery: string;
  typeFilter: string[] | null; // multi-select types
  typeFilterMode: TypeFilterMode; // 'any' = OR, 'all' = AND (dual-type)
  generationFilter: number[] | null; // multi-select generations
  evoLineSizeFilter: number[] | null; // [1], [2], [3] where 3 means 3+
  mobileBrowserOpen: boolean;
  drillDownSegment: DrillDownSegment | null;
  drillDownPeek: boolean;
  drillDownSiblings: DrillDownSegment[]; // ordered list of all segments in the same chart
  drillDownExcludeSpecial: boolean; // whether the chart's exclusion toggle was active
  whatsAdvisorExpanded: boolean;

  // Actions
  addToSection: (sectionId: string, pokemonIds: number[]) => void;
  removeBranch: (sectionId: string, pokemonId: number) => void;
  removeEvoLine: (sectionId: string, pokemonId: number) => void;
  moveEvoLine: (fromSection: string, evoLineIds: number[], toSection: string, insertBeforeIndex: number) => void;
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
  setEvoLineSizeFilter: (sizes: number[] | null) => void;
  openDrillDown: (segment: DrillDownSegment, siblings?: DrillDownSegment[], excludeSpecial?: boolean) => void;
  expandDrillDown: () => void;
  closeDrillDown: () => void;
  navigateDrillDown: (segment: DrillDownSegment) => void;
  setWhatsAdvisorExpanded: (expanded: boolean) => void;
}

const GROUP_ID_SET = new Set(BUILD_GROUP_IDS);

export const usePokedexStore = create<PokedexState>()(
  persist(
    (set, get) => ({
      sections: createEmptySections(),
      activeSection: null,
      activeCategoryFilter: null,
      activeArchetypeFilter: null,
      searchQuery: '',
      typeFilter: null,
      typeFilterMode: 'any' as TypeFilterMode,
      generationFilter: null,
      evoLineSizeFilter: null,
      mobileBrowserOpen: false,
      drillDownSegment: null,
      drillDownPeek: true,
      drillDownSiblings: [],
      drillDownExcludeSpecial: false,
      whatsAdvisorExpanded: true,

      addToSection: (sectionId, pokemonIds) =>
        set((state) => {
          const allIds: number[] = [];
          const seen = new Set<number>();
          for (const id of pokemonIds) {
            const line = getEvolutionLine(id);
            for (const p of line) {
              if (!seen.has(p.id)) {
                seen.add(p.id);
                allIds.push(p.id);
              }
            }
          }

          const newSections = { ...state.sections };
          const addingSet = new Set(allIds);
          for (const sid of BUILD_GROUP_IDS) {
            if (newSections[sid]) {
              newSections[sid] = newSections[sid].filter((id) => !addingSet.has(id));
            }
          }

          if (!newSections[sectionId]) newSections[sectionId] = [];
          newSections[sectionId] = [...newSections[sectionId], ...allIds];

          return {
            sections: newSections,
          };
        }),

      removeBranch: (sectionId, pokemonId) =>
        set((state) => {
          const sectionIds = state.sections[sectionId] ?? [];
          // Remove target + all its descendants
          const removeSet = new Set(getDescendantIds(pokemonId));
          const remaining = new Set(sectionIds.filter((id) => !removeSet.has(id)));
          // Walk up ancestors: remove any that are now stranded (no descendants left in section)
          let current = getPokemonById(pokemonId);
          while (current?.evolvesFrom) {
            const parent = getPokemonById(current.evolvesFrom);
            if (!parent || !remaining.has(parent.id)) break;
            const parentDescendants = getDescendantIds(parent.id);
            const hasRemaining = parentDescendants.some((id) => id !== parent.id && remaining.has(id));
            if (!hasRemaining) {
              remaining.delete(parent.id);
              current = parent;
            } else {
              break;
            }
          }
          const newSections = { ...state.sections };
          newSections[sectionId] = sectionIds.filter((id) => remaining.has(id));
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

      setEvoLineSizeFilter: (sizes) => set({ evoLineSizeFilter: sizes }),

      openDrillDown: (segment, siblings, excludeSpecial) => set({ drillDownSegment: segment, drillDownPeek: true, drillDownSiblings: siblings ?? [], drillDownExcludeSpecial: excludeSpecial ?? false }),
      expandDrillDown: () => set({ drillDownPeek: false }),
      closeDrillDown: () => set({ drillDownSegment: null, drillDownPeek: true, drillDownSiblings: [], drillDownExcludeSpecial: false }),
      navigateDrillDown: (segment) => set({ drillDownSegment: segment }),
      setWhatsAdvisorExpanded: (expanded) => set({ whatsAdvisorExpanded: expanded }),
    }),
    {
      name: 'personal-151-pokedex-v3',
      partialize: (state) => ({ sections: state.sections }),
      // Migrate: if old keys found, dump all Pokemon into 'other'
      migrate: (persisted: unknown) => {
        const state = persisted as { sections?: Record<string, number[]> };
        if (!state.sections) return { sections: createEmptySections() };
        // Check if it has old section keys
        const hasOldKeys = Object.keys(state.sections).some(k => !GROUP_ID_SET.has(k));
        if (hasOldKeys) {
          const newSections = createEmptySections();
          const allIds = Object.values(state.sections).flat();
          newSections['other'] = allIds;
          return { sections: newSections };
        }
        // Ensure all group keys exist
        const sections = { ...createEmptySections(), ...state.sections };
        return { sections };
      },
      version: 3,
    }
  )
);
