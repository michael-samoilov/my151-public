/**
 * The completion burst each tool fires once: the Pokédex Maker at 151, the
 * Favorite Pokémon Picker at a full grid, and the League Maker at 14 full
 * trainer cards. Each tool's saved data decides when; this only fires.
 *
 * The burst's code and glyph data (`typeStickerConfetti.ts`) load on
 * demand, so no page's first load carries them. Under
 * prefers-reduced-motion nothing loads and nothing fires; the tool's popup
 * still shows.
 */

const load = () => import('./typeStickerConfetti');
let loading: ReturnType<typeof load> | null = null;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function loadBurst(): ReturnType<typeof load> {
  loading ??= load();
  // A failed download is retried on the next call. No `reloadIfStale` here:
  // a reload at the moment of completion would cost more than the burst.
  loading.catch(() => { loading = null; });
  return loading;
}

/** Starts the download when a burst is about to fire, so it fires on time. */
export function preloadCompletionConfetti(): void {
  if (!prefersReducedMotion()) void loadBurst();
}

/** Fires the burst once its code is in. A failed download skips it. */
export function fireCompletionConfetti(): void {
  if (prefersReducedMotion()) return;
  void loadBurst().then((m) => m.burstTypeStickers(), () => {});
}
