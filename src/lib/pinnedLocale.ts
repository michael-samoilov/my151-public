import { usePokedexStore } from '@/store/usePokedexStore';

export function getPinnedLocale(): string | undefined {
  return usePokedexStore.getState().locale ?? undefined;
}
