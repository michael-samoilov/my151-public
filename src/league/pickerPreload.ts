import { useEffect } from 'react';
import { browserFavoriteIds, browserFilterOptions, useFavoriteBrowserStore } from '@/components/browser/browserStore';
import { browseSubgroups, gridDefinitions, gridModels } from '@/components/browser/gridLayout';
import { filterPokemon, groupEvolutionLines } from '@/hooks/usePokemonData';
import { warmSprites } from '@/lib/spriteWarmup';
import { whenIdle } from '@/lib/whenIdle';
import { usePokedexStore } from '@/store/usePokedexStore';
import { leaguePokemonDataSource as dataSource } from './data/catalog';
import { pickerOpenState, useLeagueBrowserStore } from './store/browserBridge';
import { useLeagueStore } from './store/useLeagueStore';
import { useLeagueUi } from './store/useLeagueUi';

// About five phone screens of tiles. Every single-type page (the largest is
// 176) still loads in full.
const PRELOAD_LIMIT = 180;

// The start of the page an empty cell's picker opens to, in the order the
// picker draws it. The picker's other purposes show a subset of it, or the
// card's own Pokémon, which the card already draws.
function pickerPageSprites(cardIndex: number): string[] {
  const state = pickerOpenState(cardIndex, 'lines', useLeagueBrowserStore.getState(), 1);
  const { favoritesFilter, favoriteIds } = useFavoriteBrowserStore.getState();
  const options = browserFilterOptions(
    { ...state, favoritesFilter, favoriteIds: browserFavoriteIds(favoriteIds, dataSource) },
    dataSource,
  );
  const inputs = { ...state, ...gridDefinitions(options), groups: groupEvolutionLines(filterPokemon(options), options), dataSource };
  const sprites = new Set<string>();
  for (const model of gridModels(browseSubgroups(inputs), false, inputs)) {
    for (const group of [...model.groups ?? [], ...model.leftGroups ?? [], ...model.rightGroups ?? []]) {
      for (const member of group.members) sprites.add(model.spriteOverrides?.[member.id] ?? member.sprite);
    }
  }
  return [...sprites].slice(0, PRELOAD_LIMIT);
}

// A picker tile whose sprite is not in the browser yet opens blank, and stays
// blank for as long as the fetch takes. The phone keeps the last card mounted
// after it closes, so only an open card warms its picker.
export function usePickerPreload(cardIndex: number): void {
  const open = useLeagueUi((s) => s.openCard === cardIndex);
  const type = useLeagueStore((s) => s.cards[cardIndex]?.type);
  const favoritesFilter = useFavoriteBrowserStore((s) => s.favoritesFilter);
  const myDexFilter = useLeagueBrowserStore((s) => s.myDexFilter);
  const sections = usePokedexStore((s) => s.sections);
  useEffect(() => {
    if (!open) return;
    // React runs this effect inside the tap that opened the card, so the
    // filtering waits for idle time instead of delaying that tap's frame.
    let live = true;
    // A page the picker no longer opens to stops loading, so it does not hold
    // up the next one.
    let drop = () => {};
    whenIdle(() => {
      if (live) drop = warmSprites(pickerPageSprites(cardIndex), true);
    });
    return () => {
      live = false;
      drop();
    };
  }, [open, cardIndex, type, favoritesFilter, myDexFilter, sections]);
}
