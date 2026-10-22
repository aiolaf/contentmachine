// Note texts kept on this device in IndexedDB, keyed by git blob sha. A sha
// names one exact content, so a cached text never goes stale: the full-text
// search reads each note from GitHub only once.
const DB = 'contentmachine';
const STORE = 'teksten';

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openTextCache(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return null;
  let db = null;
  const ready = () => {
    if (!db) {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      db = request(open);
    }
    return db;
  };
  const run = async (mode, fn) => {
    const tx = (await ready()).transaction(STORE, mode);
    return request(fn(tx.objectStore(STORE)));
  };
  return {
    async get(sha) {
      const v = await run('readonly', (s) => s.get(sha));
      return typeof v === 'string' ? v : undefined;
    },
    set: (sha, text) => run('readwrite', (s) => s.put(text, sha)),
    // Drops texts of notes that no longer exist in this version of the vault.
    async prune(keep) {
      const keys = await run('readonly', (s) => s.getAllKeys());
      const old = keys.filter((k) => !keep.has(k));
      if (!old.length) return 0;
      const tx = (await ready()).transaction(STORE, 'readwrite');
      for (const k of old) tx.objectStore(STORE).delete(k);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return old.length;
    },
  };
}
