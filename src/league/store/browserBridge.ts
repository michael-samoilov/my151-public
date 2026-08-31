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
  /**
   * The type filter the team scope displaced, kept so turning the scope off
   * puts it back.
   *
   * Scoping to the card's own team and filtering by the gym's type are the
   * same question asked twice: every line on a Rock gym is already Rock, so
   * the type chip only narrows the team to a subset of itself, and on a
   * mono-type card it can narrow it to nothing. The scope therefore clears
   * the type filter — and remembers it, because turning the scope back off
   * restores a pane the user recognises.
   */
  typeBeforeScope?: string[] | null;
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
    scopeFilterLocked: false,
    scopeFilterLockedHint: undefined,
    typeBeforeScope: null,
    standaloneTiles: false,

    openFor: (card) => {
      const purpose = ui().browserPurpose;
      const type = league().cards[card]?.type ?? null;
      const lines = league().cards[card]?.lines ?? [];
      const placed = new Set(placedIds(lines));
      const cardFull = lines.length >= TEAM_SIZES[BOSS_ROW - 1];
      // The signature comes from the team once the template is full: there is
      // no seventh seat for a line from outside it. That is a lock rather
      // than a hidden rule, so the chip shows, shows as on, and says why.
      const scopeLocked = purpose === 'signature' && cardFull;
      // Both one-Pokemon pickers offer the chip; only the ace's can lock it.
      // A partner is the leader's companion rather than their sixth Pokemon,
      // so narrowing to the team stays available and never becomes the rule.
      const scoped = purpose === 'signature' || purpose === 'partner';
      const scopeOn = scoped && lines.length > 0
        ? (scopeLocked || (get().scopeFilter ?? false))
        : false;
      const gymType: string[] | null = type && type !== 'none' ? [type] : null;
      set({
        activeSection: sectionKey(card),
        sections: { [sectionKey(card)]: placedIds(league().cards[card]?.lines ?? []) },
        searchQuery: '',
        activeCategoryFilter: null,
        activeArchetypeFilter: null,
        // The leader's own type arrives pre-selected whatever the pane is
        // picking — a line, a replacement, the signature, or the endgame
        // boss's legendary. The chip is there to remove when the gym wants
        // something off-type.
        //
        // Except under the team scope, which asks the same question already:
        // every line on a Rock gym is Rock, so the type chip narrows the team
        // to a subset of itself and can narrow it to nothing. It is put aside
        // rather than dropped, and comes back when the scope goes off.
        typeFilter: scopeOn ? null : gymType,
        typeBeforeScope: scopeOn ? gymType : null,
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
        scopeFilter: scopeOn,
        // No chip at all on an empty card: there is no team to narrow to, and
        // a chip whose only effect is an empty result is a dead end. A full
        // card does get one, locked — see `scopeLocked` above.
        scopeFilterIds: scoped && lines.length > 0 ? placed : undefined,
        scopeFilterLabel: scoped && lines.length > 0 ? 'Current Team' : undefined,
        scopeFilterLocked: scopeLocked,
        scopeFilterLockedHint: scopeLocked ? 'Choose a pokemon from your team' : undefined,
        // The branches themselves, so the scoped view can draw the lines the
        // user seated rather than the chains they belong to.
        scopeFilterLines: scoped ? lines.map((l) => l.branch) : undefined,
        // The ace is one Pokemon, and so are the boss's legendary and the
        // partner, so each Pokemon is its own tile — and the grid merges a
        // split chain's branches, so none of them appears twice.
        standaloneTiles: purpose === 'signature' || purpose === 'legend' || purpose === 'partner',
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
          seat: ui().targetSeat,
        });
        ui().closeBrowser();
      } else if (purpose === 'replace') {
        // The seat keeps its place in the team; only its line changes.
        league().replaceLine(card, ui().targetSeat, branch);
        ui().closeBrowser();
      } else if (purpose === 'signature') {
        // Under six lines the signature line seats itself rightmost,
        // shifting the rest left (DECISIONS.md item 12). The tapped Pokemon
        // ends the branch, and it is also the one the slot must show.
        league().placeBranch(card, branch, 'front');
        league().setSignatureSeat(card, 1, branch[branch.length - 1]);
        ui().closeBrowser();
      } else if (purpose === 'partner') {
        // A partner is seated when the card has room and not otherwise, so
        // one pick means two different things depending on how full the card
        // is. `placeBranch` already no-ops on a full card, which is exactly
        // the rule: on a five-line card the partner becomes the sixth line
        // *and* the partner; on a full one it lives in the slot alone.
        league().placeBranch(card, branch);
        league().setPartner(card, branch[branch.length - 1]);
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
          useLeagueStore.getState().setLegend(card, { pokemonId: final, seat: ui().targetSeat });
        }
        ui().closeBrowser();
      } else if (purpose === 'replace') {
        // Already on the card: swapping a seat for a line the team already
        // holds would duplicate it, so this is "keep what is there".
        ui().closeBrowser();
      } else if (purpose === 'signature') {
        // Tapping an already-placed line marks it, rather than removing it.
        // The mark carries the tapped Pokemon as well as its seat: the tiles
        // are one Pokemon each, so a tap on Geodude means Geodude and not
        // whichever member of its line the boss row would field.
        const seat =
          useLeagueStore.getState().cards[card]?.lines.findIndex((l) => l.branch.includes(pokemonId)) ?? -1;
        if (seat >= 0) useLeagueStore.getState().setSignatureSeat(card, seat + 1, pokemonId);
        ui().closeBrowser();
      } else if (purpose === 'partner') {
        // Already on the card: a tap names it the partner rather than
        // removing the line it sits in.
        useLeagueStore.getState().setPartner(card, pokemonId);
        ui().closeBrowser();
      } else {
        // A second tap on a species already on the card adds another of it,
        // rather than taking the first one away. A gym can field two
        // Geodudes, and the card's own red ✗ is how a line comes off — so
        // the picker never has to double as the remove control.
        useLeagueStore.getState().placeBranch(card, branchEndingAt(pokemonId));
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
    setScopeFilter: (on) =>
      set((s) => {
        if (on) {
          return { scopeFilter: true, typeFilter: null, typeBeforeScope: s.typeFilter };
        }
        // Only the filter the scope itself displaced comes back. A type the
        // user picked while scoped is their newer answer and outranks it.
        const restore = (s.typeFilter?.length ?? 0) > 0 ? s.typeFilter : (s.typeBeforeScope ?? null);
        return { scopeFilter: false, typeFilter: restore, typeBeforeScope: null };
      }),
  };
});

/** Open the selection pane aimed at a card, for one of its three purposes. */
export function openLeagueBrowser(
  card: number,
  purpose: BrowserPurpose,
  targetSeat = 1,
  replacingId: number | null = null,
): void {
  useLeagueUi.getState().openBrowser(purpose, targetSeat, replacingId);
  useLeagueBrowserStore.getState().openFor(card);
}
