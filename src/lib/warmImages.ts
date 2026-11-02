// platform: A decoded image with no reference can lose its bitmap, so a later swap waits for decode even when the response is cached.
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
