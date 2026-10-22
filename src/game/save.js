// IndexedDB persistence for worlds and modified chunks
const DB_NAME = 'infinicraft';
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function rleEncode(a) {
  const out = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i]; let n = 1;
    while (i + n < a.length && a[i + n] === v && n < 65535) n++;
    out.push(n & 255, n >> 8, v);
    i += n;
  }
  return new Uint8Array(out);
}
export function rleDecode(r, size) {
  const a = new Uint8Array(size);
  let p = 0;
  for (let i = 0; i < r.length; i += 3) { const n = r[i] | (r[i + 1] << 8); a.fill(r[i + 2], p, p + n); p += n; }
  return a;
}

export async function listWorlds() {
  const d = await db();
  const all = await req(d.transaction('worlds').objectStore('worlds').getAll());
  return all.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
}

export async function saveWorld(meta, chunks, size) {
  const d = await db();
  const tx = d.transaction(['worlds', 'chunks'], 'readwrite');
  tx.objectStore('worlds').put(meta);
  const cs = tx.objectStore('chunks');
  for (const [k, data] of chunks) cs.put(rleEncode(data), meta.id + ':' + k);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

export async function loadChunks(id, size) {
  const d = await db();
  const store = d.transaction('chunks').objectStore('chunks');
  const range = IDBKeyRange.bound(id + ':', id + ':\uffff');
  const keys = await req(store.getAllKeys(range));
  const vals = await req(store.getAll(range));
  const m = new Map();
  keys.forEach((k, i) => m.set(k.slice(id.length + 1), rleDecode(vals[i], size)));
  return m;
}

export async function deleteWorld(id) {
  const d = await db();
  const tx = d.transaction(['worlds', 'chunks'], 'readwrite');
  tx.objectStore('worlds').delete(id);
  tx.objectStore('chunks').delete(IDBKeyRange.bound(id + ':', id + ':\uffff'));
  return new Promise((res) => { tx.oncomplete = res; });
}
