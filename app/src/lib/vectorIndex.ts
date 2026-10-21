// The knowledge base (v4.13): the passages of every book and the vectors
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
//
// The SEARCH itself lives in lib/retrieval.ts — this file is the storage
// half and the thin wrappers the rest of the app still calls.
import type { Chunk } from "./chunks";
import { combinedScore, cosine, lexicalScore, wordsOf } from "./vectorScore";
import {
  allVectors,
  chunksById,
  deleteByPrefix,
  forgetAll,
  forgetVectors,
  putAll,
  type StoredChunk,
  type StoredVector,
} from "./vectorStore";
import { retrieve, type SearchHit } from "./retrieval";

export { cosine, combinedScore, lexicalScore, wordsOf };
export type { StoredChunk, StoredVector, SearchHit };

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
    w: wordsOf(c.text),
  }));
  const vecs: StoredVector[] = vectors.map((v, i) => ({
    id: chunks[i]?.id ?? `${bookId}:${i}`,
    v,
  }));
  await putAll("chunks", stored);
  await putAll("vectors", vecs);
  forgetAll();
}

/** Forget a book: its passages and its vectors. */
export async function deleteIndex(bookId: string): Promise<void> {
  await deleteByPrefix("chunks", bookId);
  await deleteByPrefix("vectors", bookId);
  forgetAll();
}

/** How many embeddings the knowledge base holds. */
export async function indexSize(): Promise<number> {
  const all = await allVectors();
  return all.length;
}

/** The books the knowledge base has embeddings for. */
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
  opts: { bookId?: string; maxItem?: number; topK?: number } = {},
): Promise<SearchHit[]> {
  return retrieve(question, query, opts);
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
  opts: { bookId?: string; maxItem?: number; topK?: number } = {},
): Promise<SearchHit[]> {
  return retrieve(question, null, opts);
}

/** The passages of the ids, read one by one. */
export { chunksById, forgetVectors };
