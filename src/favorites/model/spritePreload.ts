import { useEffect, useSyncExternalStore } from 'react';
import { whenIdle } from '@/lib/whenIdle';
import { allPickerMons } from './catalog';
import { cellKey, type GenAxisId, type TypeAxisId } from './cells';
import { eligibleFor } from './eligibility';
import { bulkGroups, cellPackName, cellSprites, FIRST_CELL, type PackManifest } from './spritePacks';

declare const __PICKER_SPRITE_PACKS__: PackManifest | null;

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
    const moved = new Set(fresh);
    queue = [...fresh, ...queue.filter((url) => !moved.has(url))];
  } else {
    const queued = new Set(queue);
    queue.push(...fresh.filter((url) => !queued.has(url)));
  }
  pump();
}

const spritesOf = (type: TypeAxisId, gen: GenAxisId) => eligibleFor(type, gen).map((mon) => mon.sprite);

interface BulkPack {
  url: string;
  sprites: string[];
  state: 'idle' | 'queued' | 'loading' | 'done' | 'failed';
  ticket: number;
}

interface PackSet {
  bulk: BulkPack[];
  bulkOf: Map<string, BulkPack>;
  cells: string;
}

let packSet: PackSet | null | undefined;

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

const packed = new Map<string, Uint8Array<ArrayBuffer>>();
const objectUrls = new Map<string, string>();
const blobs = new Map<string, Blob>();
const ready = (sprite: string) => packed.has(sprite);

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

const asFiles = new Set<string>();
const waiting = new Map<string, number>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

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
  const current = new Set(packs()?.bulk.map((p) => p.url));
  try { localStorage.setItem(LOADED_KEY, JSON.stringify([...loaded].filter((url) => current.has(url)))); }
  catch { /* Storage can be unavailable in private browsing. */ }
}

const fetching = new Map<string, { done: Promise<void>; abort: AbortController; urgent: boolean }>();

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
    return;
  }
}

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
      await fetchPack(set.bulk[0].url, set.bulk[0].sprites, true);
      set.bulk[0].state = 'done';
      rememberLoaded(set.bulk[0]);
    } else {
      await fetchPack(`${set.cells}${cellPackName(type, gen)}`, cellSprites(type, gen), true);
    }
  } catch {
    return;
  }
}

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

export function openCell(type: TypeAxisId, gen: GenAxisId): void {
  prefetchCell(type, gen);
  if (!spritesOf(type, gen).some((sprite) => waiting.has(sprite))) return;
  for (const running of fetching.values()) if (!running.urgent) running.abort.abort();
}

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

export function prefetchEverySprite(): void {
  const set = packs();
  if (!set) {
    enqueue(allPickerMons().map((mon) => mon.sprite), false);
    return;
  }
  for (const pack of set.bulk) if (pack.state === 'idle') queueBulk(pack);
  pumpBulk();
}

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function source(sprite: string, wait: boolean): string {
  if (asFiles.has(sprite) || !packs()?.bulkOf.has(sprite)) return sprite;
  const url = objectUrl(sprite);
  if (url) return url;
  if (wait && waiting.has(sprite)) return BLANK;
  asFiles.add(sprite);
  return sprite;
}

export function pickerSpriteSrc(sprite: string): string {
  return source(sprite, false);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePickerSprite(sprite: string, keep = false): string {
  const src = useSyncExternalStore(subscribe, () => source(sprite, true), () => sprite);
  useEffect(() => {
    if (keep && src !== sprite && src !== BLANK) keepForNextVisit(sprite);
  }, [keep, sprite, src]);
  return src;
}

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
