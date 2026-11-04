// Everything lives in IndexedDB on this device: recordings, transcripts, people
// and settings. Nothing is sent anywhere unless you transcribe or share.
const NAME = 'notulist';
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meetings')) db.createObjectStore('meetings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['mid', 'part', 'seq'] });
      if (!db.objectStoreNames.contains('people')) db.createObjectStore('people', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('De database is in gebruik in een ander venster. Sluit dat venster en probeer opnieuw.'));
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((r) => { out = r; });
    tx.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Opslaan afgebroken. Is je opslag vol?'));
  }));
}

const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const db = {
  get: (store, key) => open().then((d) => req(d.transaction(store).objectStore(store).get(key))),
  all: (store) => open().then((d) => req(d.transaction(store).objectStore(store).getAll())),
  put: (store, value, key) => run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),

  // Recording chunks: written every few seconds so a crash loses almost nothing.
  addChunk: (mid, part, seq, blob) => run('chunks', 'readwrite', (s) => s.put({ mid, part, seq, blob })),
  chunks: (mid, part) => open().then((d) => req(d.transaction('chunks').objectStore('chunks')
    .getAll(IDBKeyRange.bound([mid, part, 0], [mid, part, Infinity])))),
  dropChunks: (mid) => run('chunks', 'readwrite', (s) => s.delete(IDBKeyRange.bound([mid, -Infinity, -Infinity], [mid, Infinity, Infinity]))),
};

export const meetings = {
  all: () => db.all('meetings'),
  get: (id) => db.get('meetings', id),
  save: (m) => { m.updatedAt = new Date().toISOString(); return db.put('meetings', m); },
  async remove(id) {
    const m = await db.get('meetings', id);
    for (let i = 0; i < (m?.parts?.length || 1); i++) await db.del('audio', `${id}:${i}`);
    await db.dropChunks(id);
    await db.del('meetings', id);
  },
};

export const audio = {
  get: (id, part = 0) => db.get('audio', `${id}:${part}`),
  put: (id, part, blob) => db.put('audio', blob, `${id}:${part}`),
  del: (id, part = 0) => db.del('audio', `${id}:${part}`),
};

export const kv = {
  get: (k) => db.get('kv', k),
  set: (k, v) => db.put('kv', v, k),
};

export async function storageInfo() {
  const est = (await navigator.storage?.estimate?.()) || {};
  const persisted = (await navigator.storage?.persisted?.()) || false;
  return { usage: est.usage || 0, quota: est.quota || 0, persisted };
}

export async function askPersist() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
