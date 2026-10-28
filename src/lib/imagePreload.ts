import { useEffect } from 'react';
import { whenIdle } from './whenIdle';

const decoded = new Map<string, HTMLImageElement>();
const loading = new Set<string>();
let queue: string[] = [];
export const MAX_LOADING = 8;

function pump() {
  while (loading.size < MAX_LOADING && queue.length > 0) {
    const url = queue.shift()!;
    if (decoded.has(url) || loading.has(url)) continue;
    loading.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    img.decode().then(() => decoded.set(url, img)).catch(() => {}).finally(() => {
      loading.delete(url);
      pump();
    });
  }
}

/**
 * Loads and decodes images, at most `MAX_LOADING` at a time, and keeps them so
 * an `<img>` that later shows one paints it at once. `first` puts these ahead
 * of the images already waiting.
 */
export function preloadImages(urls: readonly string[], first = false): void {
  if (typeof Image === 'undefined') return;
  const fresh = [...new Set(urls)].filter((url) => !decoded.has(url) && !loading.has(url));
  if (first) {
    const moved = new Set(fresh);
    queue = [...fresh, ...queue.filter((url) => !moved.has(url))];
  } else {
    const queued = new Set(queue);
    queue.push(...fresh.filter((url) => !queued.has(url)));
  }
  pump();
}

/**
 * At most this long before `usePreloadImages` starts. A phone that has just opened a picker sheet
 * gives no idle time for about 3 s, longer than a person takes to press Shiny.
 */
const PRELOAD_WAIT_MS = 300;

/** Preloads `urls` once the page is idle or `PRELOAD_WAIT_MS` has passed, behind any images already queued. */
export function usePreloadImages(urls: readonly string[]): void {
  useEffect(() => {
    if (urls.length === 0) return;
    let live = true;
    whenIdle(() => { if (live) preloadImages(urls); }, PRELOAD_WAIT_MS);
    return () => { live = false; };
  }, [urls]);
}
