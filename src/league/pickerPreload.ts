import { useEffect } from 'react';
import { browserFavoriteIds, browserFilterOptions, useFavoriteBrowserStore } from '@/components/browser/browserStore';
import { filterPokemon, groupEvolutionLines, type EvolutionGroup } from '@/hooks/usePokemonData';
import { warmSprites } from '@/lib/spriteWarmup';
import { whenIdle } from '@/lib/whenIdle';
import { usePokedexStore } from '@/store/usePokedexStore';
import { leaguePokemonDataSource as dataSource } from './data/catalog';
import { pickerOpenState, useLeagueBrowserStore } from './store/browserBridge';
import { useLeagueStore } from './store/useLeagueStore';
import { useLeagueUi } from './store/useLeagueUi';

function pickerPageSprites(cardIndex: number): string[] {
  const state = pickerOpenState(cardIndex, 'lines', useLeagueBrowserStore.getState(), 1);
  if (!state.typeFilter) return [];
  const { favoritesFilter, favoriteIds } = useFavoriteBrowserStore.getState();
  const options = browserFilterOptions(
    { ...state, favoritesFilter, favoriteIds: browserFavoriteIds(favoriteIds, dataSource) },
    dataSource,
  );
  const groups = groupEvolutionLines(filterPokemon(options), options);
  const generation = (group: EvolutionGroup) =>
    group.members.find((m) => group.matchedIds.has(m.id))?.generation ?? 0;
  groups.sort((a, b) => generation(a) - generation(b));
  return [...new Set(groups.flatMap((group) => group.members.map((m) => m.sprite)))];
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
    whenIdle(() => {
      if (live) warmSprites(pickerPageSprites(cardIndex), true);
    });
    return () => {
      live = false;
    };
  }, [open, cardIndex, type, favoritesFilter, myDexFilter, sections]);
}
