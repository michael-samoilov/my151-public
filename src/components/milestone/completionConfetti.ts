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
  loading.catch(() => { loading = null; });
  return loading;
}

export function preloadCompletionConfetti(): void {
  if (!prefersReducedMotion()) void loadBurst();
}

export function fireCompletionConfetti(): void {
  if (prefersReducedMotion()) return;
  void loadBurst().then((m) => m.burstTypeStickers(), () => {});
}
