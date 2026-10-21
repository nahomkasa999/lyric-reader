// The indexing queue (v4.13).
//
// A book is chunked into passages the moment it is imported — that part
// is local, immediate and offline. Turning those passages into VECTORS
// needs the network and a key, so it waits in a queue: one row per
// book, in IndexedDB, so the queue survives a reload and a crash.
//
// The row is the whole truth about a book's job. Nothing else is kept
// in memory, because the phone can be closed between two batches.
import { openDb } from "./db";
import { EMBED_BATCH, MIN_GAP_MS } from "./indexPlan";

/** Where a job stands. */
export type IndexState = "pending" | "running" | "paused" | "failed" | "done";

/** One book's job, as it sits in the `indexJobs` store. */
export interface IndexJobRow {
  bookId: string;
  state: IndexState;
  /** passages embedded so far (persisted after every batch) */
  embedded: number;
  /** passages in the book */
  total: number;
  /** failed attempts, for backoff */
  attempts: number;
  lastError: string | null;
  updatedAt: number;
  /** epoch ms; 0 = eligible now */
  nextTryAt: number;
  /**
   * How many passages go into one request. It shrinks when the API
   * says the batch is too big for the quota — a rate limit on a fresh
   * key usually means the batch, not the key.
   */
  batch: number;
  /** How long to wait between two requests, in ms. */
  gapMs: number;
}

/** How the queue is doing — what the library and the sheet show. */
export interface IndexProgress {
  bookId: string;
  done: number;
  total: number;
  state: IndexState;
  error: string | null;
  /** books still waiting in the queue, this one included */
  queued: number;
}

/** A fresh job for a book that has not been embedded yet. */
export function newJob(bookId: string, total: number): IndexJobRow {
  return {
    bookId,
    state: "pending",
    embedded: 0,
    total,
    attempts: 0,
    lastError: null,
    updatedAt: Date.now(),
    nextTryAt: 0,
    batch: EMBED_BATCH,
    gapMs: MIN_GAP_MS,
  };
}

/** The job of a book, or null when it was never queued. */
export async function getJob(bookId: string): Promise<IndexJobRow | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("indexJobs", "readonly");
    const req = t.objectStore("indexJobs").get(bookId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as IndexJobRow | undefined) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Every job in the queue, oldest first. */
export async function listJobs(): Promise<IndexJobRow[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("indexJobs", "readonly");
    const req = t.objectStore("indexJobs").getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as IndexJobRow[]) ?? []);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/** Write a job back. */
export async function saveJob(job: IndexJobRow): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("indexJobs", "readwrite");
    t.objectStore("indexJobs").put(job);
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

/** Forget a book's job — the book itself was deleted. */
export async function deleteJob(bookId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const t = db.transaction("indexJobs", "readwrite");
    t.objectStore("indexJobs").delete(bookId);
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

/** How many books are still waiting (pending, running or failed). */
export function queuedCount(jobs: IndexJobRow[]): number {
  return jobs.filter((j) => j.state !== "done").length;
}
