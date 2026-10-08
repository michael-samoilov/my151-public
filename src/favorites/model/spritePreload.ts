import { allPickerMons } from './catalog';
import type { GenAxisId, TypeAxisId } from './cells';
import { eligibleFor } from './eligibility';

/**
 * Picker sprites, fetched before the selector needs them, in the order a
 * visitor is likely to need them, so a first visit does not start with all
 * 1,388 (1.5 MiB):
 *
 * 1. Normal / Gen I, the cell nearly every visitor opens first, then on a
 *    touch screen the cells in view (`prefetchCellSoon`).
 * 2. A cell that a pointer rests on, a finger presses, or the keyboard
 *    focuses jumps the queue (`prefetchCell`).
 * 3. After the first selector opens, every other sprite (`prefetchEverySprite`).
 *
 * The decoded images stay referenced here, so the selector draws them at once.
 */
const decoded = new Map<string, HTMLImageElement>();
const loading = new Set<string>();
let queue: string[] = [];
const MAX_LOADING = 8;

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

function enqueue(urls: string[], first: boolean) {
  if (typeof Image === 'undefined') return;
  const fresh = [...new Set(urls)].filter((url) => !decoded.has(url) && !loading.has(url));
  if (first) {
    // Move them to the front, out of wherever they already wait.
    const moved = new Set(fresh);
    queue = [...fresh, ...queue.filter((url) => !moved.has(url))];
  } else {
    const queued = new Set(queue);
    queue.push(...fresh.filter((url) => !queued.has(url)));
  }
  pump();
}

const spritesOf = (type: TypeAxisId, gen: GenAxisId) => eligibleFor(type, gen).map((mon) => mon.sprite);

/** The cell the visitor is about to open: its sprites go first. */
export function prefetchCell(type: TypeAxisId, gen: GenAxisId): void {
  enqueue(spritesOf(type, gen), true);
}

/** A cell in view: its sprites join the end of the queue. */
export function prefetchCellSoon(type: TypeAxisId, gen: GenAxisId): void {
  enqueue(spritesOf(type, gen), false);
}

/** Every picker sprite, behind whatever is already queued. */
export function prefetchEverySprite(): void {
  enqueue(allPickerMons().map((mon) => mon.sprite), false);
}
