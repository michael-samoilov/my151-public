// platform: On iOS, the first Cache Storage read after idle grows with every entry, so sprites live in IndexedDB.
const DB_NAME = 'p151-sprites';
const STORE = 'sprites';

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
// platform: WebKit does not store a Blob from a worker, so each record holds { type, bytes }.
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

self.addEventListener('message', (event) => {
  const { keep: url, blob } = event.data || {};
  if (typeof url === 'string' && blob instanceof Blob) {
    event.waitUntil(blob.arrayBuffer().then((bytes) => keep(url, blob.type, bytes)).catch(() => {}));
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))));
});
