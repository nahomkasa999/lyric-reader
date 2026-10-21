// The knowledge base (v4.12): the passages of every book and the vectors
// that find them.
//
// Storage is IndexedDB (the app's own layer — lib/db.ts): a `chunks` store
// with the passages, and a `vectors` store with the embeddings. The
// vectors are Float32Array blobs; the search is a cosine scan in JS.
//
// Why not SQLite: SQLite has no vector type — it would need the
// sqlite-vec extension compiled into a WASM build, and the whole library
// layer would have to move off IndexedDB to get it. The maths would be
// identical JS either way, and for a personal library (a few thousand
// passages) the scan takes milliseconds. The index sits behind this
// module, so it can be swapped later without touching the assistant.
import type { Chunk } from "./chunks";
import { cosine, combinedScore, lexicalScore, wordsOf } from "./vectorScore";
import {
  allVectors,
  chunksById,
  forgetVectors,
  putAll,
  type StoredChunk,
  type StoredVector,
} from "./vectorStore";
import { openDb } from "./db";

export { cosine, combinedScore, lexicalScore, wordsOf };
export type { StoredChunk, StoredVector };

/** One passage the search found. */
export interface SearchHit {
  chunk: StoredChunk;
  /** the combined score */
  score: number;
  /** the semantic part */
  semantic: number;
  /** the keyword part */
  lexical: number;
}

/** Store a book's passages and their vectors (one write, one transaction each). */
export async function saveIndex(
  bookId: string,
  chunks: Chunk[],
  vectors: Float32Array[],
): Promise<void> {
  await deleteIndex(bookId);
  const stored: StoredChunk[] = chunks.map((c) => ({
    id: c.id,
    bookId: c.bookId,
    text: c.text,
    heading: c.heading,
    page: c.page,
    from: c.from,
    to: c.to,
  }));
  const vecs: StoredVector[] = vectors.map((v, i) => ({
    id: chunks[i]?.id ?? `${bookId}:${i}`,
    v,
    w: wordsOf(chunks[i]?.text ?? ""),
  }));
  await putAll("chunks", stored);
  await putAll("vectors", vecs);
  // The cache is stale now.
  forgetVectors();
}

/** Forget a book: its passages and its vectors. */
export async function deleteIndex(bookId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const t = db.transaction(["chunks", "vectors"], "readwrite");
    for (const name of ["chunks", "vectors"]) {
      const store = t.objectStore(name);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        for (const k of req.result as string[]) {
          if (typeof k === "string" && k.startsWith(`${bookId}:`))
            store.delete(k);
        }
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
  forgetVectors();
}

/** How many passages the knowledge base holds. */
export async function indexSize(): Promise<number> {
  const all = await allVectors();
  return all.length;
}

/** The books the knowledge base knows about. */
export async function indexedBooks(): Promise<string[]> {
  const all = await allVectors();
  return [...new Set(all.map((v) => v.id.split(":")[0]))];
}

/**
 * Find the passages that answer a question.
 *
 * The semantic half (cosine over the embeddings) finds passages that
 * MEAN the same thing; the keyword half finds the ones that use the same
 * words. Both together beat either alone — that is the whole point of
 * a hybrid search.
 */
export async function search(
  query: Float32Array,
  question: string,
  opts: { bookId?: string; topK?: number } = {},
): Promise<SearchHit[]> {
  const topK = opts.topK ?? 8;
  const all = await allVectors();
  if (!all.length) return [];
  const scope = opts.bookId
    ? all.filter((v) => v.id.startsWith(`${opts.bookId}:`))
    : all;
  if (!scope.length) return [];

  const scored = scope.map((v) => {
    const semantic = cosine(query, v.v);
    const lexical = lexicalScore(question, v.w);
    return { v, semantic, lexical, score: combinedScore(semantic, lexical) };
  });
  scored.sort((a, b) => b.score - a.score);
  return hitsOf(scored.slice(0, topK));
}

/**
 * Search by words only.
 *
 * The fallback when there is no key to embed the question with: no
 * meaning, but the exact words still find their passage — which is how
 * a name like "30th Street" is found at all.
 */
export async function searchByWords(
  question: string,
  opts: { bookId?: string; topK?: number } = {},
): Promise<SearchHit[]> {
  const topK = opts.topK ?? 8;
  const all = await allVectors();
  const scope = opts.bookId
    ? all.filter((v) => v.id.startsWith(`${opts.bookId}:`))
    : all;
  if (!scope.length) return [];
  const scored = scope
    .map((v) => {
      const lexical = lexicalScore(question, v.w);
      return { v, semantic: 0, lexical, score: lexical };
    })
    .filter((t) => t.lexical > 0)
    .sort((a, b) => b.score - a.score);
  return hitsOf(scored.slice(0, topK));
}

/** Turn the scored vectors into hits, with the passages they belong to. */
async function hitsOf(
  top: Array<{
    v: StoredVector;
    semantic: number;
    lexical: number;
    score: number;
  }>,
): Promise<SearchHit[]> {
  if (!top.length) return [];
  const byId = await chunksById(top.map((t) => t.v.id));
  return top
    .map((t) => {
      const chunk = byId.get(t.v.id);
      if (!chunk) return null;
      return { chunk, score: t.score, semantic: t.semantic, lexical: t.lexical };
    })
    .filter((h): h is SearchHit => !!h);
}
