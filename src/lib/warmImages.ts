/**
 * Fetch and decode images before something swaps them into a live element.
 *
 * Setting a new `src` does not blank an `<img>`: the browser keeps painting
 * the bitmap it already has until the new one is ready. That is right for a
 * page that is still loading and wrong during a drag, where the element under
 * the pointer then reads as whatever it held a moment ago.
 *
 * Warm the bitmap first and the swap paints in the same frame as the rest of
 * the change. Each URL is fetched once per page load. Nothing is pinned, so
 * the browser may still evict a bitmap it has not drawn for a while; what
 * this removes for certain is the network round trip, which is the part a
 * person sees.
 */

const warmed = new Set<string>();

export function warmImages(urls: readonly string[]): void {
  if (typeof Image === 'undefined') return;
  for (const url of urls) {
    if (warmed.has(url)) continue;
    warmed.add(url);
    const img = new Image();
    img.src = url;
    void img.decode().catch(() => {
      // A sprite that cannot decode needs no handling here. The cell that
      // shows it falls back to the browser's own broken-image behaviour,
      // exactly as it did before the warm-up existed.
    });
  }
}
