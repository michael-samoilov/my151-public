import { create } from 'zustand';
import { readFavoritePickerIds } from './favoritePickerBridge';
import { createContext, useContext } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { PokemonDataSource, PokemonFilterOptions } from '@/hooks/usePokemonData';

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

  myDexFilter?: boolean;
  myDexIds?: Set<number>;
  setMyDexFilter?: (on: boolean) => void;
  myDexSections?: Record<string, number[]>;
  restrictIds?: Set<number>;
  scopeFilter?: boolean;
  scopeFilterIds?: Set<number>;
  scopeFilterLabel?: string;
  scopeFilterLocked?: boolean;
  scopeFilterLockedHint?: string;
  setScopeFilter?: (on: boolean) => void;
  scopeFilterLines?: number[][];
  standaloneTiles?: boolean;
  shinyView?: boolean;
  setShinyView?: (on: boolean) => void;
}

type FilterInputs = Pick<BrowserStoreState,
  | 'activeCategoryFilter' | 'activeArchetypeFilter' | 'typeFilter' | 'typeFilterMode' | 'generationFilter'
  | 'shapeFilter' | 'colorFilter' | 'eggGroupFilter' | 'evoLineSizeFilter'
  | 'restrictIds' | 'myDexFilter' | 'myDexIds' | 'scopeFilter' | 'scopeFilterIds'>
  & Pick<FavoriteBrowserState, 'favoritesFilter' | 'favoriteIds'>;

function restrictionIds({
  restrictIds, favoritesFilter, favoriteIds, myDexFilter, myDexIds, scopeFilter, scopeFilterIds,
}: FilterInputs): Set<number> | undefined {
  const active: Set<number>[] = [];
  if (restrictIds) active.push(restrictIds);
  if (favoritesFilter) active.push(favoriteIds);
  if (myDexFilter && myDexIds) active.push(myDexIds);
  if (scopeFilter && scopeFilterIds) active.push(scopeFilterIds);
  if (active.length === 0) return undefined;
  return active.reduce((acc, set) => new Set([...acc].filter((id) => set.has(id))));
}

export function browserFavoriteIds(stored: Set<number>, dataSource?: PokemonDataSource): Set<number> {
  return dataSource?.favoritePickerId ? readFavoritePickerIds(dataSource.favoritePickerId) : stored;
}

export function browserFilterOptions(state: FilterInputs, dataSource?: PokemonDataSource): PokemonFilterOptions {
  return {
    dataSource,
    category: state.activeCategoryFilter,
    archetype: state.activeArchetypeFilter,
    types: state.typeFilter,
    typeMode: state.typeFilterMode,
    generations: state.generationFilter,
    shapes: state.shapeFilter,
    colors: state.colorFilter,
    eggGroups: state.eggGroupFilter,
    evoLineSize: state.evoLineSizeFilter,
    restrictToIds: restrictionIds(state),
  };
}

type BrowserStoreHook = UseBoundStore<Omit<StoreApi<BrowserStoreState>, 'setState'>>;

export const BrowserStoreContext = createContext<BrowserStoreHook>(
  usePokedexStore,
);

export function useBrowserStore<T>(selector: (s: BrowserStoreState) => T): T {
  const store = useContext(BrowserStoreContext);
  return store(selector);
}

interface FavoriteBrowserState {
  favoritesFilter: boolean;
  favoriteIds: Set<number>;
  setFavoritesFilter: (on: boolean) => void;
  refreshFavorites: () => void;
}

export const useFavoriteBrowserStore = create<FavoriteBrowserState>()((set) => ({
  favoritesFilter: false,
  favoriteIds: new Set(),
  setFavoritesFilter: (on) => set({ favoritesFilter: on, favoriteIds: readFavoritePickerIds() }),
  refreshFavorites: () => set({ favoriteIds: readFavoritePickerIds() }),
}));
