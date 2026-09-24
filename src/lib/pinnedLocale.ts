import { usePokedexStore } from '@/store/usePokedexStore';

/**
 * The locale the visitor pinned in the language picker, if any.
 *
 * `null` in the store means "follow the browser" — auto-detect on every visit.
 * A non-null value means they picked deliberately, and that choice outranks
 * `navigator.languages`. Analytics needs the distinction: Browser French +
 * Served English is either an unsupported language or a manual switch to
 * English, and only a stored pin tells those apart.
 */
export function getPinnedLocale(): string | undefined {
  return usePokedexStore.getState().locale ?? undefined;
}
