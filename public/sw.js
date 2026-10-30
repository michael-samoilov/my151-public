// Service worker: keep sprites on the device to reduce edge requests.
//
// Built files under /assets/ stay with the browser's HTTP cache: their names
// carry a content hash and they are cached as immutable for a year.
//
// Sprites live in IndexedDB, one record per sprite URL, not in Cache Storage.
// On an iPhone, the first Cache Storage read after idle took about 0.5 s at
// 1,068 entries and grows with every entry; an IndexedDB read stays near
// constant (docs/performance.md, "iPhone home page wait"). Any storage error
// falls back to the network, so a sprite always loads.
const DB_NAME = 'p151-sprites';
const STORE = 'sprites';

// A database that exists without the store (opened elsewhere before this
// worker created it) is upgraded to add the store.
function openAt(version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let database;
function openDatabase() {
  database ??= openAt(undefined).then((db) => {
    if (db.objectStoreNames.contains(STORE)) return db;
    db.close();
    return openAt(db.version + 1);
  }).then((db) => {
    db.onversionchange = () => { db.close(); database = undefined; };
    return db;
  });
  database.catch(() => { database = undefined; });
  return database;
}

function run(mode, action) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}
// Each record is { type, bytes }: WebKit does not store a Blob from a worker.
const read = (url) => run('readonly', (store) => store.get(url));
const keep = (url, type, bytes) => run('readwrite', (store) => store.put({ type, bytes }, url));

async function respond(request) {
  const stored = await read(request.url).catch(() => undefined);
  if (stored) return new Response(stored.bytes, { headers: { 'Content-Type': stored.type } });
  const response = await fetch(request);
  if (response.ok) {
    const type = response.headers.get('Content-Type') || '';
    response.clone().arrayBuffer().then((bytes) => keep(request.url, type, bytes)).catch(() => {});
  }
  return response;
}

// Replace the previous worker on this visit, so its caches go now.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const shouldKeep =
    path.startsWith('/sprites/') ||
    path === '/favicon.svg' ||
    path === '/icons.svg';

  if (shouldKeep) event.respondWith(respond(event.request));
});

// The picker hands over sprites it already holds, so a returning visitor's
// picks draw with no request.
self.addEventListener('message', (event) => {
  const { keep: url, blob } = event.data || {};
  if (typeof url === 'string' && blob instanceof Blob) {
    event.waitUntil(blob.arrayBuffer().then((bytes) => keep(url, blob.type, bytes)).catch(() => {}));
  }
});

// Earlier workers kept sprites in Cache Storage. Its first read after idle is
// the cost this worker avoids, so every cache goes.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))));
});
