import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DexSlot } from '@/types/pokemon';
import { createDefaultSlots } from '@/data/slot-template';
import { getEvolutionLine } from '@/hooks/usePokemonData';

/**
 * Place a list of pokemon IDs starting at startSlot, going forward.
 * Overwrites whatever is in those slots. Clears these pokemon from other slots.
 * Clamps to 1-151.
 */
function placeLineInSlots(
  slots: DexSlot[],
  pokemonIds: number[],
  startSlot: number
): DexSlot[] {
  // Clamp: if startSlot + line length would exceed 151, shift back
  const effectiveStart = Math.max(1, Math.min(startSlot, 152 - pokemonIds.length));

  const assignments = new Map<number, number>(); // slotNumber -> pokemonId
  for (let i = 0; i < pokemonIds.length; i++) {
    assignments.set(effectiveStart + i, pokemonIds[i]);
  }
  const placingIds = new Set(pokemonIds);

  return slots.map((slot) => {
    // If this slot is getting a new assignment
    const assignment = assignments.get(slot.slotNumber);
    if (assignment !== undefined) {
      return { ...slot, pokemonId: assignment };
    }
    // Clear this pokemon from other slots if it's being relocated
    if (slot.pokemonId !== null && placingIds.has(slot.pokemonId)) {
      return { ...slot, pokemonId: null };
    }
    return slot;
  });
}

interface PokedexState {
  slots: DexSlot[];
  selectedSlot: number | null;
  activeArchetypeFilter: string | null;
  searchQuery: string;
  typeFilter: string | null;
  generationFilter: number | null;
  mobileBrowserOpen: boolean;

  // Actions
  assignPokemon: (slotNumber: number, pokemonId: number) => void;
  assignEvoLine: (pokemonIds: number[]) => void;
  removePokemon: (slotNumber: number) => void;
  swapSlots: (slotA: number, slotB: number) => void;
  movePokemon: (fromSlot: number, toSlot: number) => void;
  clearAll: () => void;
  setSelectedSlot: (slot: number | null) => void;
  setMobileBrowserOpen: (open: boolean) => void;
  setArchetypeFilter: (archetype: string | null) => void;
  setSearchQuery: (query: string) => void;
  setTypeFilter: (type: string | null) => void;
  setGenerationFilter: (gen: number | null) => void;
}

export const usePokedexStore = create<PokedexState>()(
  persist(
    (set, get) => ({
      slots: createDefaultSlots(),
      selectedSlot: null,
      activeArchetypeFilter: null,
      searchQuery: '',
      typeFilter: null,
      generationFilter: null,
      mobileBrowserOpen: false,

      assignPokemon: (slotNumber, pokemonId) =>
        set((state) => {
          // Get the full evo line and place starting from slotNumber
          const evoLine = getEvolutionLine(pokemonId);
          const ids = evoLine.map((p) => p.id);
          // Start the line so the selected pokemon's position makes sense
          const indexInLine = ids.indexOf(pokemonId);
          const lineStart = slotNumber - indexInLine;
          const newSlots = placeLineInSlots(state.slots, ids, lineStart);
          return { slots: newSlots, selectedSlot: null, mobileBrowserOpen: false };
        }),

      assignEvoLine: (pokemonIds) =>
        set((state) => {
          // Place at selected slot, or find next empty slot
          let startSlot = state.selectedSlot;
          if (startSlot === null) {
            const nextEmpty = state.slots.find((s) => s.pokemonId === null);
            startSlot = nextEmpty?.slotNumber ?? 1;
          }
          const newSlots = placeLineInSlots(state.slots, pokemonIds, startSlot);
          return { slots: newSlots, selectedSlot: null, mobileBrowserOpen: false };
        }),

      removePokemon: (slotNumber) =>
        set((state) => ({
          slots: state.slots.map((slot) =>
            slot.slotNumber === slotNumber ? { ...slot, pokemonId: null } : slot
          ),
        })),

      swapSlots: (slotA, slotB) =>
        set((state) => {
          const a = state.slots.find((s) => s.slotNumber === slotA);
          const b = state.slots.find((s) => s.slotNumber === slotB);
          if (!a || !b) return state;
          return {
            slots: state.slots.map((slot) => {
              if (slot.slotNumber === slotA) return { ...slot, pokemonId: b.pokemonId };
              if (slot.slotNumber === slotB) return { ...slot, pokemonId: a.pokemonId };
              return slot;
            }),
          };
        }),

      movePokemon: (fromSlot, toSlot) => {
        const state = get();
        const from = state.slots.find((s) => s.slotNumber === fromSlot);
        const to = state.slots.find((s) => s.slotNumber === toSlot);
        if (!from || !to) return;
        if (to.pokemonId) {
          state.swapSlots(fromSlot, toSlot);
        } else {
          set({
            slots: state.slots.map((slot) => {
              if (slot.slotNumber === fromSlot) return { ...slot, pokemonId: null };
              if (slot.slotNumber === toSlot) return { ...slot, pokemonId: from.pokemonId };
              return slot;
            }),
          });
        }
      },

      clearAll: () => set({ slots: createDefaultSlots() }),

      setSelectedSlot: (slot) => set({ selectedSlot: slot }),

      setMobileBrowserOpen: (open) => set({ mobileBrowserOpen: open }),

      setArchetypeFilter: (archetype) => set({ activeArchetypeFilter: archetype }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setTypeFilter: (type) => set({ typeFilter: type }),

      setGenerationFilter: (gen) => set({ generationFilter: gen }),
    }),
    {
      name: 'personal-151-pokedex',
      partialize: (state) => ({ slots: state.slots }),
    }
  )
);
