// The passages of every book (v4.13) — local, immediate, offline.
//
// The passages are cut the moment a book is imported and written to
// IndexedDB straight away. Keyword search therefore works from the
// first second, with no key and no network. The VECTORS (the semantic
// half of the search) are a later, optional layer — see lib/indexBook.
//
// Every passage carries its own distinct words, so the search never has
// to re-tokenize a book to find a name in it.
import { chunkBook, type Chunk } from "./chunks";
import { wordsOf } from "./vectorScore";
import {
  deleteByPrefix,
  forgetChunks,
  getAll,
  putAll,
  type StoredChunk,
} from "./vectorStore";
import type { BookDoc } from "./types";

/** The passages of a book, in reading order. */
export async function passagesOfBook(
  bookId: string,
): Promise<StoredChunk[]> {
  const all = await getAll<StoredChunk>("chunks").catch(() => []);
  return all.filter((c) => c.bookId === bookId).sort((a, b) => a.from - b.from);
}

/** How many passages a book has. */
export async function passageCount(bookId: string): Promise<number> {
  const rows = await passagesOfBook(bookId);
  return rows.length;
}

/**
 * Write a book's passages, with their words.
 *
 * Idempotent: the passages are written with their own ids, so writing
 * them twice changes nothing.
 */
export async function savePassages(
  bookId: string,
  chunks: Chunk[],
): Promise<void> {
  const rows: StoredChunk[] = chunks.map((c) => ({
    id: c.id,
    bookId,
    text: c.text,
    heading: c.heading,
    page: c.page,
    from: c.from,
    to: c.to,
    w: wordsOf(c.text),
  }));
  await putAll("chunks", rows);
  forgetChunks();
}

/**
 * Give every passage its words.
 *
 * Rows written before the words existed are healed lazily: the words
 * are computed from the text and written back, once.
 */
export async function healWords(
  rows: StoredChunk[],
): Promise<StoredChunk[]> {
  const missing = rows.filter((r) => !r.w || !r.w.length);
  if (!missing.length) return rows;
  const healed = rows.map((r) =>
    r.w && r.w.length ? r : { ...r, w: wordsOf(r.text) },
  );
  await putAll(
    "chunks",
    missing.map((r) => ({ ...r, w: wordsOf(r.text) })),
  );
  forgetChunks();
  return healed;
}

/**
 * The passages of a book — cutting them if the book has none yet.
 *
 * A book imported by an older app has no passages: they are cut now,
 * on the spot, without a key and without a network.
 */
export async function ensurePassages(book: BookDoc): Promise<StoredChunk[]> {
  const existing = await passagesOfBook(book.id);
  if (existing.length) return healWords(existing);
  const chunks = chunkBook(book.id, book.items);
  await savePassages(book.id, chunks);
  return passagesOfBook(book.id);
}

/** Forget a book's passages. */
export async function deletePassages(bookId: string): Promise<void> {
  await deleteByPrefix("chunks", bookId);
  forgetChunks();
}
