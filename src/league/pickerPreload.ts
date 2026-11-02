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

const FIVE_PHONE_SCREENS = 180;

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
  return [...sprites].slice(0, FIVE_PHONE_SCREENS);
}

export function usePickerPreload(cardIndex: number): void {
  const open = useLeagueUi((s) => s.openCard === cardIndex);
  const type = useLeagueStore((s) => s.cards[cardIndex]?.type);
  const favoritesFilter = useFavoriteBrowserStore((s) => s.favoritesFilter);
  const myDexFilter = useLeagueBrowserStore((s) => s.myDexFilter);
  const sections = usePokedexStore((s) => s.sections);
  useEffect(() => {
    if (!open) return;
    // platform: React runs this effect inside the tap that opened the card, so the filtering waits for idle time.
    let live = true;
    let dropStalePage = () => {};
    whenIdle(() => {
      if (live) dropStalePage = warmSprites(pickerPageSprites(cardIndex), true);
    });
    return () => {
      live = false;
      dropStalePage();
    };
  }, [open, cardIndex, type, favoritesFilter, myDexFilter, sections]);
}
