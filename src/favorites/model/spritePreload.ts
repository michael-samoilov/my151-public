import { useEffect, useSyncExternalStore } from 'react';
import { whenIdle } from '@/lib/whenIdle';
import { allPickerMons } from './catalog';
import { cellKey, type GenAxisId, type TypeAxisId } from './cells';
import { eligibleFor } from './eligibility';
import { bulkGroups, cellPackName, cellSprites, FIRST_CELL, type PackManifest } from './spritePacks';

/**
 * Picker sprites, fetched before the selector needs them, in the order a
 * visitor is likely to need them, so a first visit does not start with all
 * 1,391 (1.5 MiB):
 *
 * 1. Normal / Gen I, the cell nearly every visitor opens first, then on a
 *    touch screen the cells in view (`prefetchCellSoon`).
 * 2. A cell that a pointer rests on, a finger presses, or the keyboard
 *    focuses jumps the queue (`prefetchCell`).
 * 3. After the first selector opens, every other sprite (`prefetchEverySprite`).
 *
 * The build delivers the sprites in packs (spritePacks.ts), about 15 requests
 * instead of about 1,100:
 *
 * - Bulk packs serve steps 1 and 3: Normal / Gen I, then one per generation.
 * - Step 2 needs one cell. A returning visitor's browser has the bulk packs
 *   cached, so they come from there. Otherwise the cell's own pack comes: one
 *   request for the bytes that single files would bring. While the visitor
 *   looks at a selector that is still loading, the bulk packs stop and start
 *   again later.
 * - Where a pack fails, its sprites load as single files, as before packs.
 *   `vite dev` builds no packs, so it always loads single files.
 *
 * Components draw a sprite through `usePickerSprite`, and canvases through
 * `pickerSpriteSrc`. The decoded images stay referenced here, so the selector
 * draws them at once. A bulk pack brings about 150 sprites in one moment, so
 * their object URLs and decoding wait for idle time: done at once, they held
 * a 4x-throttled phone's main thread for over a second.
 */
declare const __PICKER_SPRITE_PACKS__: PackManifest | null;

// Decoded images, keyed by the URL an <img> uses: a sprite file or a pack's object URL.
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

// ---- Packs

interface BulkPack {
  url: string;
  sprites: string[];
  state: 'idle' | 'queued' | 'loading' | 'done' | 'failed';
  /** Queue position, kept when a stopped pack goes back in line. */
  ticket: number;
}

interface PackSet {
  bulk: BulkPack[];
  bulkOf: Map<string, BulkPack>;
  cells: string;
}

let packSet: PackSet | null | undefined;

/** The packs, or null where the build made none or they do not match this catalog. */
function packs(): PackSet | null {
  if (packSet !== undefined) return packSet;
  packSet = null;
  // Undefined outside Vite, such as in a Node script.
  const manifest = typeof __PICKER_SPRITE_PACKS__ === 'undefined' ? null : __PICKER_SPRITE_PACKS__;
  if (!manifest || typeof fetch === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const groups = bulkGroups();
  const used = groups.map(() => 0);
  const bulk: BulkPack[] = manifest.packs.map(({ url, group, count }) => {
    const sprites = (groups[group] ?? []).slice(used[group], used[group] + count);
    used[group] = (used[group] ?? 0) + count;
    return { url, sprites, state: 'idle', ticket: 0 };
  });
  if (groups.some((group, i) => used[i] !== group.length) || bulk.some((pack, i) => pack.sprites.length !== manifest.packs[i].count)) {
    console.warn('Picker sprite packs do not match the catalog, so the sprites load as single files.');
    return null;
  }
  const bulkOf = new Map<string, BulkPack>();
  for (const pack of bulk) for (const sprite of pack.sprites) bulkOf.set(sprite, pack);
  packSet = { bulk, bulkOf, cells: manifest.cells };
  return packSet;
}

/** Each sprite's PNG bytes, a view into the pack that brought them. */
const packed = new Map<string, Uint8Array<ArrayBuffer>>();
const objectUrls = new Map<string, string>();
const blobs = new Map<string, Blob>();
const ready = (sprite: string) => packed.has(sprite);

/**
 * A sprite's object URL, made when something first draws or decodes it. It is
 * never revoked: an <img> may still show it.
 */
function objectUrl(sprite: string): string | undefined {
  let url = objectUrls.get(sprite);
  if (url) return url;
  const bytes = packed.get(sprite);
  if (!bytes) return undefined;
  const blob = new Blob([bytes], { type: 'image/png' });
  blobs.set(sprite, blob);
  url = URL.createObjectURL(blob);
  objectUrls.set(sprite, url);
  return url;
}

/** Sprites an <img> already asked for as a file. They stay files, so no image changes its source. */
const asFiles = new Set<string>();
/** Sprites a cell's fetch is about to bring. An <img> waits for them, as it would for a file. */
const waiting = new Map<string, number>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** Each sprite's bytes in a pack, after a check that the pack matches the catalog. */
function unpack(sprites: string[], buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  const count = buffer.byteLength >= 4 ? view.getUint32(0, true) : -1;
  let offset = 4 + 4 * count;
  if (count !== sprites.length || offset > buffer.byteLength) throw new Error('The sprite pack does not match the catalog.');
  let end = offset;
  for (let i = 0; i < count; i++) end += view.getUint32(4 + 4 * i, true);
  if (end !== buffer.byteLength) throw new Error('The sprite pack does not match the catalog.');
  sprites.forEach((sprite, i) => {
    const length = view.getUint32(4 + 4 * i, true);
    if (!packed.has(sprite)) packed.set(sprite, new Uint8Array(buffer, offset, length));
    offset += length;
  });
  changed();
}

/**
 * Bulk packs this browser loaded on an earlier visit, so likely still cached.
 * Only these are looked up in the cache: a lookup that misses prints a
 * network error in the console.
 */
const LOADED_KEY = 'personal-151-favorites-packs-v1';
let loadedBefore: Set<string> | null = null;

function loadedPacks(): Set<string> {
  if (loadedBefore) return loadedBefore;
  try { loadedBefore = new Set(JSON.parse(localStorage.getItem(LOADED_KEY) ?? '[]') as string[]); }
  catch { loadedBefore = new Set(); }
  return loadedBefore;
}

function rememberLoaded(pack: BulkPack) {
  const loaded = loadedPacks();
  if (loaded.has(pack.url)) return;
  loaded.add(pack.url);
  // Only the current packs: a renamed pack is gone for good.
  const current = new Set(packs()?.bulk.map((p) => p.url));
  try { localStorage.setItem(LOADED_KEY, JSON.stringify([...loaded].filter((url) => current.has(url)))); }
  catch { /* Storage can be unavailable in private browsing. */ }
}

const fetching = new Map<string, { done: Promise<void>; abort: AbortController; urgent: boolean }>();

/** One fetch per pack URL. An urgent fetch is never stopped for the bulk packs. */
function fetchPack(url: string, sprites: string[], urgent: boolean): Promise<void> {
  const running = fetching.get(url);
  if (running) {
    running.urgent ||= urgent;
    return running.done;
  }
  const abort = new AbortController();
  const done = fetch(url, { signal: abort.signal, priority: urgent ? 'high' : 'low' })
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return response.arrayBuffer();
    })
    .then((buffer) => unpack(sprites, buffer))
    .finally(() => fetching.delete(url));
  fetching.set(url, { done, abort, urgent });
  return done;
}

/** A bulk pack from the browser's cache, never the network. A returning visitor has them. */
async function fromCache(pack: BulkPack): Promise<void> {
  // A pack already loading is left alone: the browser makes a cache read of
  // a response still arriving wait for all of it.
  if ((pack.state !== 'idle' && pack.state !== 'queued') || !loadedPacks().has(pack.url)) return;
  try {
    const response = await fetch(pack.url, { cache: 'only-if-cached', mode: 'same-origin' });
    if (!response.ok) return;
    unpack(pack.sprites, await response.arrayBuffer());
    pack.state = 'done';
  } catch {
    // Not cached.
  }
}

/** A bulk pack's sprites decode a few at a time while the page is idle, so a press never waits behind them. */
let idleDecodes: string[] = [];
let idleScheduled = false;

function decodeWhenIdle(sprites: string[]) {
  idleDecodes = [...idleDecodes, ...sprites];
  if (idleScheduled) return;
  idleScheduled = true;
  const step = () => {
    const batch = idleDecodes.slice(0, MAX_LOADING);
    idleDecodes = idleDecodes.slice(MAX_LOADING);
    enqueue(batch.filter((sprite) => !asFiles.has(sprite)).map((sprite) => objectUrl(sprite) ?? sprite), false);
    if (idleDecodes.length > 0) whenIdle(step);
    else idleScheduled = false;
  };
  whenIdle(step);
}

const MAX_BULK = 2;
let bulkQueue: BulkPack[] = [];
let bulkLoading = 0;
let tickets = 0;
/** Cells on their way to a visitor who is about to look at them. Bulk packs wait. */
let cellsLoading = 0;
const cellsFetching = new Set<string>();

function queueBulk(pack: BulkPack) {
  pack.state = 'queued';
  pack.ticket ||= ++tickets;
  bulkQueue = [...bulkQueue, pack].sort((a, b) => a.ticket - b.ticket);
}

function pumpBulk() {
  while (cellsLoading === 0 && bulkLoading < MAX_BULK && bulkQueue.length > 0) {
    const pack = bulkQueue.shift()!;
    if (pack.state !== 'queued') continue;
    pack.state = 'loading';
    bulkLoading++;
    fetchPack(pack.url, pack.sprites, false).then(() => {
      pack.state = 'done';
      rememberLoaded(pack);
      decodeWhenIdle(pack.sprites);
    }, (error: unknown) => {
      if (pack.state !== 'loading') return;
      if (error instanceof DOMException && error.name === 'AbortError') queueBulk(pack);
      else {
        pack.state = 'failed';
        enqueue(pack.sprites.filter((sprite) => !ready(sprite)), false);
      }
    }).finally(() => {
      bulkLoading--;
      pumpBulk();
    });
  }
}

function hold(sprites: string[], change: 1 | -1) {
  for (const sprite of sprites) {
    const count = (waiting.get(sprite) ?? 0) + change;
    if (count > 0) waiting.set(sprite, count);
    else waiting.delete(sprite);
  }
  changed();
}

async function fetchCell(set: PackSet, type: TypeAxisId, gen: GenAxisId, missing: string[]): Promise<void> {
  await Promise.all([...new Set(missing.map((sprite) => set.bulkOf.get(sprite)!))].map(fromCache));
  if (missing.every(ready)) return;
  const first = type === FIRST_CELL.type && gen === FIRST_CELL.gen;
  try {
    if (first) {
      // The first cell's pack is bulk pack 0: one fetch serves both.
      await fetchPack(set.bulk[0].url, set.bulk[0].sprites, true);
      set.bulk[0].state = 'done';
      rememberLoaded(set.bulk[0]);
    } else {
      await fetchPack(`${set.cells}${cellPackName(type, gen)}`, cellSprites(type, gen), true);
    }
  } catch {
    // The sprites still missing load as single files, as before packs.
  }
}

/** The cell the visitor is about to open: its sprites go first. */
export function prefetchCell(type: TypeAxisId, gen: GenAxisId): void {
  const sprites = spritesOf(type, gen);
  const set = packs();
  if (!set) {
    enqueue(sprites, true);
    return;
  }
  const missing = sprites.filter((sprite) => set.bulkOf.has(sprite) && !ready(sprite) && !asFiles.has(sprite));
  const here = sprites.filter((sprite) => !missing.includes(sprite));
  enqueue(here.map((sprite) => (asFiles.has(sprite) ? sprite : objectUrl(sprite) ?? sprite)), true);
  const key = cellKey(type, gen);
  if (missing.length === 0 || cellsFetching.has(key)) return;
  cellsFetching.add(key);
  cellsLoading++;
  hold(missing, 1);
  void fetchCell(set, type, gen, missing).finally(() => {
    cellsFetching.delete(key);
    cellsLoading--;
    hold(missing, -1);
    enqueue(missing.map((sprite) => objectUrl(sprite) ?? sprite), true);
    pumpBulk();
  });
}

/** A selector opens. While its sprites are on the way, the bulk packs stop, and start again after. */
export function openCell(type: TypeAxisId, gen: GenAxisId): void {
  prefetchCell(type, gen);
  if (!spritesOf(type, gen).some((sprite) => waiting.has(sprite))) return;
  for (const running of fetching.values()) if (!running.urgent) running.abort.abort();
}

/** A cell in view: its sprites join the end of the queue. */
export function prefetchCellSoon(type: TypeAxisId, gen: GenAxisId): void {
  const set = packs();
  if (!set) {
    enqueue(spritesOf(type, gen), false);
    return;
  }
  for (const sprite of spritesOf(type, gen)) {
    const pack = set.bulkOf.get(sprite);
    if (pack?.state === 'idle' && !ready(sprite)) queueBulk(pack);
  }
  pumpBulk();
}

/** Every picker sprite, behind whatever is already queued. */
export function prefetchEverySprite(): void {
  const set = packs();
  if (!set) {
    enqueue(allPickerMons().map((mon) => mon.sprite), false);
    return;
  }
  for (const pack of set.bulk) if (pack.state === 'idle') queueBulk(pack);
  pumpBulk();
}

// ---- Drawing

/** A transparent pixel: an <img> waiting for its cell's pack shows nothing, as one loading a file does. */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function source(sprite: string, wait: boolean): string {
  if (asFiles.has(sprite) || !packs()?.bulkOf.has(sprite)) return sprite;
  const url = objectUrl(sprite);
  if (url) return url;
  if (wait && waiting.has(sprite)) return BLANK;
  asFiles.add(sprite);
  return sprite;
}

/** The URL a canvas draws a picker sprite from: the pack's copy when it is here, else the file. */
export function pickerSpriteSrc(sprite: string): string {
  return source(sprite, false);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The URL for a picker sprite's <img>: the pack's copy once it is here, a
 * blank while the visitor's cell is on its way, else the file, as before
 * packs. With `keep`, the copy is also stored where the service worker
 * (public/sw.js) serves files from, so the grid's picks draw on the next
 * visit, before any pack arrives, without a request.
 */
export function usePickerSprite(sprite: string, keep = false): string {
  const src = useSyncExternalStore(subscribe, () => source(sprite, true), () => sprite);
  useEffect(() => {
    if (keep && src !== sprite && src !== BLANK) keepForNextVisit(sprite);
  }, [keep, sprite, src]);
  return src;
}

/** The cache public/sw.js answers sprite requests from. */
const SERVICE_WORKER_CACHE = 'p151-sprites-v2';
const kept = new Set<string>();

function keepForNextVisit(sprite: string) {
  objectUrl(sprite);
  const blob = blobs.get(sprite);
  if (!blob || kept.has(sprite) || typeof caches === 'undefined' || !('serviceWorker' in navigator)) return;
  kept.add(sprite);
  const url = new URL(sprite, location.href).href;
  caches.open(SERVICE_WORKER_CACHE)
    .then((cache) => cache.put(url, new Response(blob, { headers: { 'Content-Type': 'image/png' } })))
    .catch(() => {});
}
