/**
 * Fetch and decode sprites before a card swaps them into live elements.
 *
 * The caller must retain the returned images while it can display their URLs.
 * A URL-only cache leaves decoded images unreferenced, so a later swap can
 * still wait for bitmap activation even when the response is cached.
 * Release the references when the card changes or unmounts.
 */
export function warmImages(urls: readonly string[]): HTMLImageElement[] {
  if (typeof Image === 'undefined') return [];
  return [...new Set(urls)].map((url) => {
    const img = new Image();
    img.src = url;
    void img.decode().catch(() => {
    });
    return img;
  });
}
