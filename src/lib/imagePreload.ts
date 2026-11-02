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

const PRELOAD_WAIT_MS = 300;

export function usePreloadImages(urls: readonly string[]): void {
  useEffect(() => {
    if (urls.length === 0) return;
    let live = true;
    whenIdle(() => { if (live) preloadImages(urls); }, PRELOAD_WAIT_MS);
    return () => { live = false; };
  }, [urls]);
}
