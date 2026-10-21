// The raw storage of the knowledge base (v4.13).
//
// Two stores: `chunks` (the passages of every book, with their words)
// and `vectors` (the embeddings). The vectors are kept in memory after
// the first read — the search reads them every time, and a library of
// a few thousand passages is a few megabytes.
//
// The passages are ALWAYS written locally and immediately: the search
// must work before a single embedding exists. That is the whole point
// of the two-store split.
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
  /** the passage's distinct words — the lexical half of the search */
  w?: string[];
}

/** A vector, as it is stored. */
export interface StoredVector {
  id: string;
  v: Float32Array;
}

/** Write a list of rows into a store, in one transaction. */
export async function putAll<T>(store: string, rows: T[]): Promise<void> {
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

/** Every row of a store. */
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

// ---------------------------------------------------------------------------
// The caches. A write drops them; a read fills them.
// ---------------------------------------------------------------------------

let vectorCache: StoredVector[] | null = null;
let chunkCache: StoredChunk[] | null = null;

/** The vectors, kept in memory after the first read. */
export async function allVectors(): Promise<StoredVector[]> {
  if (vectorCache) return vectorCache;
  const all = await getAll<StoredVector>("vectors").catch(() => []);
  vectorCache = all;
  return all;
}

/** The passages of every book, kept in memory after the first read. */
export async function allChunks(): Promise<StoredChunk[]> {
  if (chunkCache) return chunkCache;
  const all = await getAll<StoredChunk>("chunks").catch(() => []);
  chunkCache = all;
  return all;
}

/** The index changed: the cached vectors are stale. */
export function forgetVectors(): void {
  vectorCache = null;
}

/** The passages changed: the cached passages are stale. */
export function forgetChunks(): void {
  chunkCache = null;
}

/** Everything changed. */
export function forgetAll(): void {
  vectorCache = null;
  chunkCache = null;
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

/**
 * Forget every row of a store whose key starts with `${prefix}:`.
 *
 * The ids of a book's rows all share the book's id, so a prefix scan
 * is enough to delete them all.
 */
export async function deleteByPrefix(
  store: string,
  prefix: string,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const t = db.transaction(store, "readwrite");
    const s = t.objectStore(store);
    const req = s.getAllKeys();
    req.onsuccess = () => {
      for (const k of req.result as string[]) {
        if (typeof k === "string" && k.startsWith(`${prefix}:`)) s.delete(k);
      }
    };
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Add vectors for a book, from a given passage index.
 *
 * The ids are `${bookId}:${from + i}` — the same shape the passages use,
 * so a vector and its passage always line up.
 */
export async function appendVectors(
  bookId: string,
  from: number,
  vectors: Float32Array[],
): Promise<void> {
  if (!vectors.length) return;
  const rows: StoredVector[] = vectors.map((v, i) => ({
    id: `${bookId}:${from + i}`,
    v,
  }));
  await putAll("vectors", rows);
  forgetVectors();
}

/** The vectors of one book. */
export async function vectorsOfBook(
  bookId: string,
): Promise<StoredVector[]> {
  const all = await allVectors();
  return all.filter((v) => v.id.startsWith(`${bookId}:`));
}

/** Forget a book's vectors — a prefix scan over the keys. */
export async function deleteVectors(bookId: string): Promise<void> {
  await deleteByPrefix("vectors", bookId);
  forgetVectors();
}
