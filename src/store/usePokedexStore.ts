import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DexSlot } from '@/types/pokemon';
import { createDefaultSlots } from '@/data/slot-template';

interface PokedexState {
  slots: DexSlot[];
  selectedSlot: number | null;
  activeArchetypeFilter: string | null;
  searchQuery: string;
  typeFilter: string | null;
  generationFilter: number | null;

  // Actions
  assignPokemon: (slotNumber: number, pokemonId: number) => void;
  removePokemon: (slotNumber: number) => void;
  swapSlots: (slotA: number, slotB: number) => void;
  movePokemon: (fromSlot: number, toSlot: number) => void;
  clearAll: () => void;
  setSelectedSlot: (slot: number | null) => void;
  setArchetypeFilter: (archetype: string | null) => void;
  setSearchQuery: (query: string) => void;
  setTypeFilter: (type: string | null) => void;
  setGenerationFilter: (gen: number | null) => void;
  assignToNextEmpty: (pokemonId: number, preferredArchetype?: string) => void;
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

      assignPokemon: (slotNumber, pokemonId) =>
        set((state) => {
          // Remove pokemon from any existing slot first
          const newSlots = state.slots.map((slot) => {
            if (slot.pokemonId === pokemonId) {
              return { ...slot, pokemonId: null };
            }
            if (slot.slotNumber === slotNumber) {
              return { ...slot, pokemonId };
            }
            return slot;
          });
          return { slots: newSlots, selectedSlot: null };
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

      setArchetypeFilter: (archetype) => set({ activeArchetypeFilter: archetype }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setTypeFilter: (type) => set({ typeFilter: type }),

      setGenerationFilter: (gen) => set({ generationFilter: gen }),

      assignToNextEmpty: (pokemonId, preferredArchetype) => {
        const state = get();
        // If there's a selected slot, assign there
        if (state.selectedSlot !== null) {
          state.assignPokemon(state.selectedSlot, pokemonId);
          return;
        }
        // Find next empty slot, preferring slots with matching archetype
        let targetSlot: DexSlot | undefined;
        if (preferredArchetype) {
          targetSlot = state.slots.find(
            (s) => s.pokemonId === null && s.suggestedArchetype === preferredArchetype
          );
        }
        if (!targetSlot) {
          targetSlot = state.slots.find((s) => s.pokemonId === null);
        }
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
