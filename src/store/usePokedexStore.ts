import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createEmptySections, SECTION_IDS } from '@/data/slot-template';
import { getEvolutionLine } from '@/hooks/usePokemonData';

interface PokedexState {
  sections: Record<string, number[]>; // sectionId -> ordered pokemon IDs
  activeSection: string | null; // which section the user is adding to
  activeArchetypeFilter: string | null;
  searchQuery: string;
  typeFilter: string | null;
  generationFilter: number | null;
  mobileBrowserOpen: boolean;

  // Actions
  addToSection: (sectionId: string, pokemonIds: number[]) => void;
  removeEvoLine: (sectionId: string, pokemonId: number) => void;
  setActiveSection: (sectionId: string | null) => void;
  clearAll: () => void;
  setMobileBrowserOpen: (open: boolean) => void;
  setArchetypeFilter: (archetype: string | null) => void;
  setSearchQuery: (query: string) => void;
  setTypeFilter: (type: string | null) => void;
  setGenerationFilter: (gen: number | null) => void;
}

export const usePokedexStore = create<PokedexState>()(
  persist(
    (set) => ({
      sections: createEmptySections(),
      activeSection: null,
      activeArchetypeFilter: null,
      searchQuery: '',
      typeFilter: null,
      generationFilter: null,
      mobileBrowserOpen: false,

      addToSection: (sectionId, pokemonIds) =>
        set((state) => {
          // Expand each ID to its full evo line, dedup, preserve order
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

          // Check total won't exceed 151
          const totalPlaced = Object.values(state.sections).reduce((s, a) => s + a.length, 0);
          const slotsAvailable = 151 - totalPlaced;
          if (allIds.length > slotsAvailable) return state; // don't add if no room

          // Remove these pokemon from any other section they might be in
          const newSections = { ...state.sections };
          const addingSet = new Set(allIds);
          for (const sid of SECTION_IDS) {
            newSections[sid] = newSections[sid].filter((id) => !addingSet.has(id));
          }

          // Append to target section
          newSections[sectionId] = [...newSections[sectionId], ...allIds];

          return {
            sections: newSections,
            activeSection: null,
            mobileBrowserOpen: false,
          };
        }),

      removeEvoLine: (sectionId, pokemonId) =>
        set((state) => {
          const line = getEvolutionLine(pokemonId);
          const removeSet = new Set(line.map((p) => p.id));
          const newSections = { ...state.sections };
          newSections[sectionId] = newSections[sectionId].filter((id) => !removeSet.has(id));
          return { sections: newSections };
        }),

      setActiveSection: (sectionId) => set({ activeSection: sectionId }),

      clearAll: () => set({ sections: createEmptySections() }),

      setMobileBrowserOpen: (open) => set({ mobileBrowserOpen: open }),

      setArchetypeFilter: (archetype) => set({ activeArchetypeFilter: archetype }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setTypeFilter: (type) => set({ typeFilter: type }),

      setGenerationFilter: (gen) => set({ generationFilter: gen }),
    }),
    {
      name: 'personal-151-pokedex-v2',
      partialize: (state) => ({ sections: state.sections }),
    }
  )
);
