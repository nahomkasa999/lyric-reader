// The raw storage of the knowledge base (v4.12).
//
// Two stores: `chunks` (the passages) and `vectors` (the embeddings and
// the words of each passage). The vectors are kept in memory after the
// first read — the search reads them every time, and a library of a few
// thousand passages is a few megabytes.
import { openDb } from "./db";

/** A passage, as it is stored. */
export interface StoredChunk {
  id: string;
  bookId: string;
  text: string;
  heading: string;
  page: number;
  from: number;
  to: number;
}

/** A vector, as it is stored. */
export interface StoredVector {
  id: string;
  v: Float32Array;
  /** the passage's distinct words — the lexical half of the search */
  w: string[];
}

export async function putAll(
  store: string,
  rows: unknown[],
): Promise<void> {
  if (!rows.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    const s = t.objectStore(store);
    for (const row of rows) s.put(row);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const t = db.transaction(store, "readonly");
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as T[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * The vectors, kept in memory after the first read.
 *
 * The cache is dropped whenever the index changes — see forgetVectors().
 */
let vectorCache: StoredVector[] | null = null;

export async function allVectors(): Promise<StoredVector[]> {
  if (vectorCache) return vectorCache;
  const all = await getAll<StoredVector>("vectors").catch(() => []);
  vectorCache = all;
  return all;
}

/** The index changed: the cached vectors are stale. */
export function forgetVectors(): void {
  vectorCache = null;
}

/** The passages of the ids, read one by one (only the ones we need). */
export async function chunksById(
  ids: string[],
): Promise<Map<string, StoredChunk>> {
  const out = new Map<string, StoredChunk>();
  if (!ids.length) return out;
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const t = db.transaction("chunks", "readonly");
    const store = t.objectStore("chunks");
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result as StoredChunk | undefined;
        if (row) out.set(id, row);
      };
    }
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => {
      db.close();
      resolve();
    };
  });
  return out;
}
