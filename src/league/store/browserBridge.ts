import { create } from 'zustand';
import type { BrowserStoreState } from '@/components/browser/browserStore';
import { getAllPokemon, getPokemonById } from '@/hooks/usePokemonData';
import { usePokedexStore } from '@/store/usePokedexStore';
import { CATEGORIES } from '@/data/categories';
import { placedIds } from '../model/engine';
import { BOSS_ROW, TEAM_SIZES, slotLabel } from '../model/constants';
import { useLeagueStore } from './useLeagueStore';
import { useLeagueUi, type BrowserPurpose } from './useLeagueUi';

/**
 * The league's implementation of the browser's store interface, so
 * `PokemonBrowser` renders unchanged against league state.
 *
 * The browser speaks the dex builder's domain verbs. The bridge translates:
 * `sections` is one pseudo-section holding the open card's placed ids,
 * `addToSection` seats a branch (or marks the signature, or sets the boss
 * legend, depending on why the pane was opened), `removeEvoLine` unseats one.
 */

const LEGEND_ELIGIBLE: Set<number> = (() => {
  const ub = CATEGORIES.find((c) => c.id === 'ultra-beast');
  return new Set(
    getAllPokemon()
      .filter((p) => p.isLegendary || p.isMythical || (ub?.filter?.(p) ?? false))
      .map((p) => p.id),
  );
})();

/** Root→tapped path, walking `evolvesFrom` up from the tapped branch's leaf. */
function branchEndingAt(finalId: number): number[] {
  const branch: number[] = [];
  let cur = getPokemonById(finalId);
  while (cur) {
    branch.unshift(cur.id);
    cur = cur.evolvesFrom !== null ? getPokemonById(cur.evolvesFrom) : undefined;
  }
  return branch;
}

function sectionKey(card: number): string {
  return `slot-${card}`;
}

export function labelForLeagueSection(sectionId: string): string {
  const index = Number(sectionId.replace('slot-', ''));
  return Number.isNaN(index) ? sectionId : slotLabel(index);
}

interface BridgeState extends BrowserStoreState {
  /** (Re)aim the pane at a card and reset the filter state for its purpose. */
  openFor: (card: number) => void;
  /** Recompute the sections mirror after any league mutation. */
  refresh: () => void;
}

export const useLeagueBrowserStore = create<BridgeState>()((set, get) => {
  const ui = () => useLeagueUi.getState();
  const league = () => useLeagueStore.getState();

  const cardIndex = () => {
    const open = ui().openCard;
    return open ?? 0;
  };

  const mirror = () => {
    const card = league().cards[cardIndex()];
    return { [sectionKey(cardIndex())]: card ? placedIds(card.lines) : [] };
  };

  return {
    sections: {},
    activeSection: null,
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
    myDexFilter: false,
    myDexIds: new Set<number>(),
    myDexSections: undefined,
    restrictIds: undefined,
    scopeFilter: false,
    scopeFilterIds: undefined,
    scopeFilterLabel: undefined,
    scopeFilterLines: undefined,
    standaloneTiles: false,

    openFor: (card) => {
      const purpose = ui().browserPurpose;
      const type = league().cards[card]?.type ?? null;
      const lines = league().cards[card]?.lines ?? [];
      const placed = new Set(placedIds(lines));
      const cardFull = lines.length >= TEAM_SIZES[BOSS_ROW - 1];
      set({
        activeSection: sectionKey(card),
        sections: { [sectionKey(card)]: placedIds(league().cards[card]?.lines ?? []) },
        searchQuery: '',
        activeCategoryFilter: null,
        activeArchetypeFilter: null,
        // The leader's own type arrives pre-selected whenever the pane is
        // picking pokemon for the card — lines and the signature alike. The
        // signature's scope chip narrows to the team on top of that.
        typeFilter: purpose !== 'legend' && type && type !== 'none' ? [type] : null,
        typeFilterMode: 'any',
        generationFilter: null,
        shapeFilter: null,
        colorFilter: null,
        eggGroupFilter: null,
        evoLineSizeFilter: null,
        // "My dex" is the user's own choice and survives reopening the pane;
        // only its contents are re-read.
        myDexFilter: get().myDexFilter ?? false,
        // "My dex" filters to the dex builder's own placed set, read from its
        // store (both stores share the page); snapshot at open is enough. The
        // sections come along so the chip can group results the way the user
        // built them.
        myDexIds: new Set(Object.values(usePokedexStore.getState().sections).flat()),
        myDexSections: usePokedexStore.getState().sections,
        // The legendary picker restricts structurally. The signature picker
        // starts on the gym's type with a "Current Team" chip to narrow to
        // the card's own placed lines — and once the template is full, the
        // restriction
        // is structural: a seventh line has nowhere to sit.
        restrictIds:
          purpose === 'legend'
            ? LEGEND_ELIGIBLE
            : purpose === 'signature' && cardFull
              ? placed
              : undefined,
        // The scope chip is the user's choice and survives reopening the
        // pane, like "My dex". It cannot outlive what it scopes to, though:
        // with no lines seated it would filter to nothing, so an empty card
        // clears it rather than handing back a dead end.
        scopeFilter: lines.length > 0 ? (get().scopeFilter ?? false) : false,
        // No chip at all on an empty card: there is no team to narrow to, and
        // a chip whose only effect is an empty result is a dead end.
        scopeFilterIds: purpose === 'signature' && !cardFull && lines.length > 0 ? placed : undefined,
        scopeFilterLabel:
          purpose === 'signature' && !cardFull && lines.length > 0 ? 'Current Team' : undefined,
        // The branches themselves, so the scoped view can draw the lines the
        // user seated rather than the chains they belong to.
        scopeFilterLines: purpose === 'signature' ? lines.map((l) => l.branch) : undefined,
        // The signature is one Pokémon, so each one is its own tile.
        standaloneTiles: purpose === 'signature',
      });
    },

    refresh: () => set({ sections: mirror() }),

    addToSection: (_sectionId, ids) => {
      if (ids.length === 0) return;
      const card = cardIndex();
      const purpose = ui().browserPurpose;
      const branch = branchEndingAt(ids[ids.length - 1]);
      if (purpose === 'legend') {
        league().setLegend(card, {
          pokemonId: branch[branch.length - 1],
          seat: ui().legendSeat,
        });
        ui().closeBrowser();
      } else if (purpose === 'signature') {
        // Under six lines the signature line seats itself rightmost,
        // shifting the rest left (DECISIONS.md item 12).
        league().placeBranch(card, branch, 'front');
        league().setSignatureSeat(card, 1);
        ui().closeBrowser();
      } else {
        league().placeBranch(card, branch);
      }
      get().refresh();
    },

    removeEvoLine: (_sectionId, pokemonId) => {
      const card = cardIndex();
      const purpose = ui().browserPurpose;
      if (purpose === 'legend') {
        const final = branchEndingAt(pokemonId).pop();
        if (final !== undefined) {
          useLeagueStore.getState().setLegend(card, { pokemonId: final, seat: ui().legendSeat });
        }
        ui().closeBrowser();
      } else if (purpose === 'signature') {
        // Tapping an already-placed line marks it, rather than removing it.
        const seat =
          useLeagueStore.getState().cards[card]?.lines.findIndex((l) => l.branch.includes(pokemonId)) ?? -1;
        if (seat >= 0) useLeagueStore.getState().setSignatureSeat(card, seat + 1);
        ui().closeBrowser();
      } else {
        useLeagueStore.getState().removeLineWith(card, pokemonId);
      }
      get().refresh();
    },

    setActiveSection: (sectionId) => {
      if (sectionId === null) ui().closeBrowser();
      set({ activeSection: sectionId });
    },
    setMobileBrowserOpen: (open) => {
      if (!open) ui().closeBrowser();
    },

    setCategoryFilter: (category) => set({ activeCategoryFilter: category, activeArchetypeFilter: null }),
    setArchetypeFilter: (archetype) => set({ activeArchetypeFilter: archetype, activeCategoryFilter: null }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setTypeFilter: (typeFilter) => set({ typeFilter }),
    setTypeFilterMode: (typeFilterMode) => set({ typeFilterMode }),
    toggleType: (type) =>
      set((s) => {
        const cur = s.typeFilter ?? [];
        const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
        return { typeFilter: next.length > 0 ? next : null };
      }),
    setGenerationFilter: (generationFilter) => set({ generationFilter }),
    toggleGeneration: (gen) =>
      set((s) => {
        const cur = s.generationFilter ?? [];
        const next = cur.includes(gen) ? cur.filter((g) => g !== gen) : [...cur, gen];
        return { generationFilter: next.length > 0 ? next : null };
      }),
    setShapeFilter: (shapeFilter) => set({ shapeFilter }),
    toggleShape: (shape) =>
      set((s) => {
        const cur = s.shapeFilter ?? [];
        const next = cur.includes(shape) ? cur.filter((x) => x !== shape) : [...cur, shape];
        return { shapeFilter: next.length > 0 ? next : null };
      }),
    setColorFilter: (colorFilter) => set({ colorFilter }),
    toggleColor: (color) =>
      set((s) => {
        const cur = s.colorFilter ?? [];
        const next = cur.includes(color) ? cur.filter((x) => x !== color) : [...cur, color];
        return { colorFilter: next.length > 0 ? next : null };
      }),
    setEggGroupFilter: (eggGroupFilter) => set({ eggGroupFilter }),
    toggleEggGroup: (group) =>
      set((s) => {
        const cur = s.eggGroupFilter ?? [];
        const next = cur.includes(group) ? cur.filter((x) => x !== group) : [...cur, group];
        return { eggGroupFilter: next.length > 0 ? next : null };
      }),
    setEvoLineSizeFilter: (evoLineSizeFilter) => set({ evoLineSizeFilter }),
    setMyDexFilter: (on) => set({ myDexFilter: on }),
    setScopeFilter: (on) => set({ scopeFilter: on }),
  };
});

/** Open the selection pane aimed at a card, for one of its three purposes. */
export function openLeagueBrowser(card: number, purpose: BrowserPurpose, legendSeat = 1): void {
  useLeagueUi.getState().openBrowser(purpose, legendSeat);
  useLeagueBrowserStore.getState().openFor(card);
}
