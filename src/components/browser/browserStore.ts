import { createContext, useContext } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { usePokedexStore } from '@/store/usePokedexStore';

/**
 * The slice of store state and actions `PokemonBrowser` actually reads.
 *
 * The browser is used by two apps with two different stores: the dex builder
 * (its original home, backed by `usePokedexStore`) and the league builder,
 * which supplies its own store through `BrowserStoreContext`. The component
 * itself is store-agnostic — it renders the same tree either way, which is
 * what keeps the league's selection pane the *same component* rather than a
 * lookalike.
 *
 * The domain verbs are deliberately the dex builder's: `sections` is a map of
 * section id → placed ids, `addToSection` places a line, `removeEvoLine`
 * removes one. The league's bridge maps those onto its own intent (one
 * pseudo-section per open card). Widening this interface widens the contract
 * for both stores, so keep it to what the browser renders.
 */
export interface BrowserStoreState {
  sections: Record<string, number[]>;
  activeSection: string | null;
  activeCategoryFilter: string | null;
  activeArchetypeFilter: string | null;
  searchQuery: string;
  typeFilter: string[] | null;
  typeFilterMode: 'any' | 'all';
  generationFilter: number[] | null;
  shapeFilter: string[] | null;
  colorFilter: string[] | null;
  eggGroupFilter: string[] | null;
  evoLineSizeFilter: number[] | null;

  addToSection: (sectionId: string, pokemonIds: number[]) => void;
  removeEvoLine: (sectionId: string, pokemonId: number) => void;
  setActiveSection: (sectionId: string | null) => void;
  setMobileBrowserOpen: (open: boolean) => void;
  setCategoryFilter: (category: string | null) => void;
  setArchetypeFilter: (archetype: string | null) => void;
  setSearchQuery: (query: string) => void;
  setTypeFilter: (types: string[] | null) => void;
  setTypeFilterMode: (mode: 'any' | 'all') => void;
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

  /**
   * Optional capability: restrict results to a fixed id set ("My dex" in the
   * league builder — the ids placed in the user's own Pokédex). The chip
   * renders only when a store defines these, so the dex builder — where the
   * filter would be a tautology — never shows it.
   */
  myDexFilter?: boolean;
  myDexIds?: Set<number>;
  setMyDexFilter?: (on: boolean) => void;
  /**
   * The same dex, still divided into the build page's sections. With the
   * chip on, the results group and order by those sections instead of by
   * generation — a dex the user built section by section reads back the way
   * they built it. A flat `myDexIds` cannot express that, so the host passes
   * the division as well as the membership.
   */
  myDexSections?: Record<string, number[]>;
  /**
   * Optional capability: a structural restriction with no chip — the league's
   * legend picker offers only legendaries, whatever the other filters say.
   */
  restrictIds?: Set<number>;
  /**
   * Optional toggleable scope chip (league signature: "Card lines"). When
   * the chip is on, results restrict to `scopeFilterIds`. Absent fields
   * hide the chip; `restrictIds` stays the structural, chipless variant.
   */
  scopeFilter?: boolean;
  scopeFilterIds?: Set<number>;
  scopeFilterLabel?: string;
  /**
   * The scope is on and cannot be turned off, because the host has nowhere
   * to put a pick from outside it — a full gym card has no seventh seat.
   *
   * The chip still shows, and shows as on, because the alternative is a pane
   * that silently offers six Pokemon with no said reason. It wears a lock
   * instead of a dismiss, and says why when pressed.
   */
  scopeFilterLocked?: boolean;
  /** Why the scope cannot be turned off. Shown when a locked chip is pressed. */
  scopeFilterLockedHint?: string;
  setScopeFilter?: (on: boolean) => void;
  /**
   * The scope as the lines it was built from, not just their members.
   *
   * A flat id set cannot say which branch of a split chain the user actually
   * chose: with Scyther and Scizor in scope, the chain's own grouping still
   * offers Kleavor, and a chain that splits shows Scyther once per branch.
   * Given the lines, the scoped view draws exactly them — each line once,
   * each Pokémon once.
   */
  scopeFilterLines?: number[][];
  /**
   * Each Pokémon is its own tile and its own pick, rather than a line being
   * one tile that picks all of its members. The signature slot takes one
   * Pokémon, so the line-shaped tile was picking the wrong thing: tapping
   * Chinchou staged Lanturn, the last member of its line.
   */
  standaloneTiles?: boolean;
}

type BrowserStoreHook = UseBoundStore<StoreApi<BrowserStoreState>>;

/**
 * `usePokedexStore`'s state is a structural superset of `BrowserStoreState`,
 * so the dex builder needs no provider: the default value IS the real store.
 */
export const BrowserStoreContext = createContext<BrowserStoreHook>(
  usePokedexStore as unknown as BrowserStoreHook,
);

/** Drop-in replacement for `usePokedexStore(selector)` inside the browser. */
export function useBrowserStore<T>(selector: (s: BrowserStoreState) => T): T {
  const store = useContext(BrowserStoreContext);
  return store(selector);
}
