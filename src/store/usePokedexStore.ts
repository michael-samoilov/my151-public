import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DexSlot } from '@/types/pokemon';
import { createDefaultSlots } from '@/data/slot-template';
import { getEvolutionLine } from '@/hooks/usePokemonData';

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
  assignToNextEmpty: (pokemonId: number) => void;
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
          const evoLine = getEvolutionLine(pokemonId);
          // Find where the selected Pokemon sits in its evo line
          const indexInLine = evoLine.findIndex(p => p.id === pokemonId);

          // Build a list of (slotNumber, pokemonId) assignments
          const assignments: { slot: number; pid: number }[] = [];
          for (let i = 0; i < evoLine.length; i++) {
            const targetSlot = slotNumber + (i - indexInLine);
            if (targetSlot >= 1 && targetSlot <= 151) {
              assignments.push({ slot: targetSlot, pid: evoLine[i].id });
            }
          }

          // All pokemon IDs being placed (to clear them from other slots)
          const placingIds = new Set(assignments.map(a => a.pid));
          // Slots being written to
          const targetSlots = new Set(assignments.map(a => a.slot));

          const newSlots = state.slots.map((slot) => {
            // Clear this pokemon if it's already placed elsewhere
            if (slot.pokemonId !== null && placingIds.has(slot.pokemonId) && !targetSlots.has(slot.slotNumber)) {
              return { ...slot, pokemonId: null };
            }
            // Assign to target slots
            const assignment = assignments.find(a => a.slot === slot.slotNumber);
            if (assignment) {
              return { ...slot, pokemonId: assignment.pid };
            }
            return slot;
          });
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
          // Swap if target is occupied
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

      assignToNextEmpty: (pokemonId) => {
        const state = get();
        // If there's a selected slot, assign there
        if (state.selectedSlot !== null) {
          state.assignPokemon(state.selectedSlot, pokemonId);
          return;
        }
        // Find next empty slot
        const targetSlot = state.slots.find((s) => s.pokemonId === null);
        if (targetSlot) {
          state.assignPokemon(targetSlot.slotNumber, pokemonId);
        }
      },
    }),
    {
      name: 'personal-151-pokedex',
      partialize: (state) => ({ slots: state.slots }),
    }
  )
);
