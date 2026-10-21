// Indexing a book (v4.12): the job that turns a book into passages the
// assistant can search.
//
// It runs in the BACKGROUND after an import — reading never waits for
// it — and it can be cancelled. The progress is reported so the library
// can show "Indexing… 42%".
//
// The embeddings come from Gemini with the reader's own key (lib/
// apikey.ts). There is no key → no index → the assistant falls back to
// searching the raw text of the books, which still finds exact words.
import { chunkBook, type Chunk } from "./chunks";
import { embedTexts } from "./embeddings";
import { getEffectiveApiKey } from "./apikey";
import { saveIndex } from "./vectorIndex";
import type { BookDoc } from "./types";

export interface IndexProgress {
  bookId: string;
  /** passages embedded so far */
  done: number;
  /** passages in total */
  total: number;
  state: "running" | "done" | "cancelled" | "failed";
  error?: string;
}

/** A job that can be stopped from the outside. */
export interface IndexJob {
  /** stop the job — the work already done is kept */
  cancel: () => void;
}

/**
 * Index one book: cut it into passages, embed them, store them.
 *
 * The passages are embedded in small batches so the progress moves and
 * a failure half way through still leaves the earlier passages ready.
 */
export async function indexBook(
  book: BookDoc,
  key: string,
  onProgress?: (p: IndexProgress) => void,
  job?: IndexJob,
): Promise<IndexProgress> {
  const chunks: Chunk[] = chunkBook(book.id, book.items);
  const report = (state: IndexProgress["state"], error?: string) => {
    onProgress?.({
      bookId: book.id,
      done: embedded,
      total: chunks.length,
      state,
      error,
    });
  };
  let embedded = 0;

  if (!chunks.length) {
    report("done");
    return { bookId: book.id, done: 0, total: 0, state: "done" };
  }

  const vectors: Float32Array[] = [];
  const BATCH = 20;
  for (let i = 0; i < chunks.length; i += BATCH) {
    if (job?.cancel) {
      report("cancelled");
      return {
        bookId: book.id,
        done: embedded,
        total: chunks.length,
        state: "cancelled",
      };
    }
    const slice = chunks.slice(i, i + BATCH);
    let batch: Float32Array[];
    try {
      batch = await embedTexts(
        slice.map((c) => c.text),
        "RETRIEVAL_DOCUMENT",
        key,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Indexing failed.";
      report("failed", message);
      return {
        bookId: book.id,
        done: embedded,
        total: chunks.length,
        state: "failed",
        error: message,
      };
    }
    vectors.push(...batch);
    embedded += slice.length;
    report("running");
  }

  try {
    await saveIndex(book.id, chunks, vectors);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Indexing failed.";
    report("failed", message);
    return {
      bookId: book.id,
      done: embedded,
      total: chunks.length,
      state: "failed",
      error: message,
    };
  }

  report("done");
  return {
    bookId: book.id,
    done: embedded,
    total: chunks.length,
    state: "done",
  };
}

/** A sentence that says how far along the indexing is. */
export function indexLabel(p: IndexProgress): string {
  switch (p.state) {
    case "done":
      return "Ready to search";
    case "cancelled":
      return "Indexing stopped";
    case "failed":
      return p.error ?? "Indexing failed";
    default:
      return p.total
        ? `Indexing… ${Math.round((p.done / p.total) * 100)}%`
        : "Indexing…";
  }
}

// ---------------------------------------------------------------------------
// The runner: one job at a time, in the background.
// ---------------------------------------------------------------------------

const jobs = new Map<string, IndexJob>();
const progress = new Map<string, IndexProgress>();
const listeners = new Set<(p: IndexProgress) => void>();

function publish(p: IndexProgress): void {
  progress.set(p.bookId, p);
  for (const fn of listeners) fn(p);
}

/** How the indexing of one book is going. */
export function indexProgressOf(bookId: string): IndexProgress | null {
  return progress.get(bookId) ?? null;
}

/** Listen to the progress of every job. Returns the unlisten. */
export function onIndexProgress(
  fn: (p: IndexProgress) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Stop the job for a book. */
export function cancelIndexing(bookId: string): void {
  const job = jobs.get(bookId);
  if (job) job.cancel();
  jobs.delete(bookId);
}

/**
 * Index a book in the background.
 *
 * A book that is already being indexed is left alone. Without a key
 * nothing happens: the embeddings need one, and the assistant then
 * searches the books by words only.
 */
export function startIndexing(book: BookDoc): void {
  const key = getEffectiveApiKey();
  if (!key) return;
  if (jobs.has(book.id)) return;
  const job: IndexJob = { cancel: () => job.cancel() };
  jobs.set(book.id, job);
  void indexBook(book, key, publish, job)
    .catch(() => {
      /* the job reports its own failures */
    })
    .finally(() => {
      jobs.delete(book.id);
    });
}
