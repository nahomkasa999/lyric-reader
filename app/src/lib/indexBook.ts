// The indexing queue (v4.13) — the runner.
//
// A book becomes searchable in two steps, and only the first one needs
// anything but this phone:
//   1. PASSAGES: cut locally, written immediately. Keyword search works
//      from the first second, offline, with no key.
//   2. VECTORS: embedded with the reader's own Gemini key. This needs
//      the network, so it waits in a queue (lib/indexJobs.ts).
//
// One job runs at a time. The queue survives a reload: the row says how
// many passages are embedded, and the next run picks up from there.
import { getBook, listBooks } from "./db";
import { embedTexts } from "./embeddings";
import { getApiKeys, getEffectiveApiKey } from "./apikey";
import { GeminiError } from "./gemini";
import {
  deleteJob,
  getJob,
  listJobs,
  newJob,
  queuedCount,
  saveJob,
  type IndexJobRow,
  type IndexProgress,
} from "./indexJobs";
import {
  biggerGap,
  EMBED_BATCH,
  MAX_ATTEMPTS,
  MIN_GAP_MS,
  nextBatch,
  pickJob,
  smallerBatch,
  throttleMs,
} from "./indexPlan";
import { ensurePassages, passagesOfBook } from "./passages";
import {
  appendVectors,
  deleteVectors,
  vectorsOfBook,
} from "./vectorStore";
import type { BookDoc } from "./types";

export type { IndexProgress } from "./indexJobs";

/** A job that can be stopped from the outside. */
export interface IndexJob {
  cancel: () => void;
}

// ---------------------------------------------------------------------------
// The progress the library and the sheet listen to.
// ---------------------------------------------------------------------------

const listeners = new Set<(p: IndexProgress) => void>();
const progress = new Map<string, IndexProgress>();

function publish(p: IndexProgress): void {
  progress.set(p.bookId, p);
  for (const fn of listeners) fn(p);
}

/** Listen to the progress of every job. Returns the unlisten. */
export function onIndexProgress(fn: (p: IndexProgress) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** How the indexing of one book is going. */
export function indexProgressOf(bookId: string): IndexProgress | null {
  return progress.get(bookId) ?? null;
}

/** A sentence that says how far along the indexing is. */
export function indexLabel(p: IndexProgress): string {
  switch (p.state) {
    case "done":
      return "Ready to search";
    case "pending":
      return "Waiting to index";
    case "paused":
      return "Paused — will resume online";
    case "failed":
      return p.error ?? "Indexing failed";
    default:
      return p.total
        ? `Indexing… ${Math.round((p.done / p.total) * 100)}%`
        : "Indexing…";
  }
}

// ---------------------------------------------------------------------------
// The gate: nothing runs without a network, a key and a visible tab.
// ---------------------------------------------------------------------------

function isOnline(): boolean {
  try {
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}

function isVisible(): boolean {
  try {
    return !document.hidden;
  } catch {
    return true;
  }
}

/** Can the queue work right now? */
export function canRun(): boolean {
  return isOnline() && getEffectiveApiKey().length > 0 && isVisible();
}

// ---------------------------------------------------------------------------
// The runner.
// ---------------------------------------------------------------------------

let running = false;
const cancelled = new Set<string>();
/**
 * Books whose key did not work.
 *
 * The row says "failed, retry at once", but a key that did not work
 * will not work on the next try either — so the runner leaves it alone
 * until the reader changes the key or presses Retry.
 */
const skipped = new Set<string>();
/** The key the queue last saw — a change clears the skip list. */
let lastKey = "";

/** The job of a book as the UI sees it. */
function progressOf(job: IndexJobRow, queued: number): IndexProgress {
  return {
    bookId: job.bookId,
    done: job.embedded,
    total: job.total,
    state: job.state,
    error: job.lastError,
    queued,
  };
}

/** Save a job and tell everyone how far along it is. */
async function persist(job: IndexJobRow): Promise<void> {
  job.updatedAt = Date.now();
  await saveJob(job).catch(() => {});
  const jobs = await listJobs().catch(() => []);
  publish(progressOf(job, queuedCount(jobs)));
}

/**
 * Queue a book.
 *
 * The passages are cut and written right away — that part never waits
 * for a key. The embeddings are queued; the runner picks them up when
 * the phone is online and a key exists.
 */
export function startIndexing(book: BookDoc): void {
  void ensurePassages(book)
    .then(async (passages) => {
      skipped.delete(book.id);
      const existing = await getJob(book.id).catch(() => null);
      const vectors = await vectorsOfBook(book.id).catch(() => []);
      const job: IndexJobRow = existing ?? newJob(book.id, passages.length);
      job.total = passages.length;
      job.batch = job.batch || EMBED_BATCH;
      job.gapMs = job.gapMs || MIN_GAP_MS;
      // Keep the work that was already done.
      job.embedded = Math.min(job.embedded, vectors.length);
      if (job.state !== "done" || job.embedded < job.total) {
        job.state = job.state === "done" ? "pending" : job.state;
      }
      job.nextTryAt = 0;
      await saveJob(job).catch(() => {});
      kickIndexer();
    })
    .catch(() => {
      /* the passages are cut again on the next run */
    });
}

/** Queue every book of the library. */
export async function indexLibraryNow(): Promise<void> {
  const metas = await listBooks().catch(() => []);
  for (const meta of metas) {
    const book = await getBook(meta.id).catch(() => undefined);
    if (book) startIndexing(book);
  }
}

/** Try again now — the reader asked for it. */
export async function retryIndexing(bookId: string): Promise<void> {
  const job = await getJob(bookId).catch(() => null);
  if (!job) return;
  job.attempts = 0;
  job.nextTryAt = 0;
  job.state = "pending";
  job.lastError = null;
  skipped.delete(bookId);
  await saveJob(job).catch(() => {});
  kickIndexer();
}

/** Stop the queue — every waiting job is paused. */
export async function pauseIndexing(): Promise<void> {
  const jobs = await listJobs().catch(() => []);
  for (const job of jobs) {
    if (job.state === "pending" || job.state === "running") {
      job.state = "paused";
      await saveJob(job).catch(() => {});
    }
  }
  await refreshAll();
}

/** Start the queue again. */
export async function resumeIndexing(): Promise<void> {
  const jobs = await listJobs().catch(() => []);
  for (const job of jobs) {
    if (job.state === "paused") {
      job.state = "pending";
      await saveJob(job).catch(() => {});
    }
  }
  await refreshAll();
  kickIndexer();
}

/** Publish the progress of every job — used when the sheet opens. */
export async function refreshAll(): Promise<void> {
  const jobs = await listJobs().catch(() => []);
  for (const job of jobs) publish(progressOf(job, queuedCount(jobs)));
}

/**
 * Run the next job that is due.
 *
 * A no-op when the phone is offline, has no key, is hidden, or another
 * job is already running.
 */
export function kickIndexer(): void {
  if (running) return;
  if (!canRun()) return;
  // A new key may fix a book that failed with the old one.
  const key = getEffectiveApiKey();
  if (key !== lastKey) {
    lastKey = key;
    skipped.clear();
  }
  void (async () => {
    const jobs = await listJobs().catch(() => []);
    const due = jobs.filter((j) => !skipped.has(j.bookId));
    const job = pickJob(due, Date.now(), canRun());
    if (!job) return;
    running = true;
    try {
      await runJob(job);
    } finally {
      running = false;
    }
    kickIndexer();
  })().catch(() => {
    running = false;
  });
}

/**
 * Embed one book, a batch at a time.
 *
 * After every batch the job row is written, so a reload — or a crash —
 * resumes at the passage it stopped at.
 */
async function runJob(job: IndexJobRow): Promise<void> {
  // getBook heals the segmentation of an old book — never bypass it.
  const book = await getBook(job.bookId).catch(() => undefined);
  if (!book) {
    await deleteJob(job.bookId).catch(() => {});
    return;
  }

  const passages = await passagesOfBook(job.bookId);
  const ready = passages.length ? passages : await ensurePassages(book);
  job.total = ready.length;

  // The vectors are gone but the job thinks they are there: start over.
  const vectors = await vectorsOfBook(job.bookId).catch(() => []);
  if (vectors.length < job.embedded) {
    await deleteVectors(job.bookId).catch(() => {});
    job.embedded = 0;
  }

  job.state = "running";
  await persist(job);

  for (;;) {
    if (cancelled.has(job.bookId)) {
      cancelled.delete(job.bookId);
      job.state = "paused";
      await persist(job);
      return;
    }
    // A hidden tab must not burn the reader's data.
    if (document.hidden) {
      job.state = "paused";
      await persist(job);
      return;
    }
    const slice = nextBatch(job.total, job.embedded, job.batch);
    if (!slice) {
      job.state = "done";
      job.embedded = job.total;
      job.lastError = null;
      await persist(job);
      return;
    }
    const texts = ready.slice(slice.from, slice.to).map((p) => p.text);
    let batch: Float32Array[];
    try {
      // The queue does not hammer the API: the requests are spaced out.
      await waitForTurn(job.gapMs || MIN_GAP_MS);
      batch = await embedWithRotation(texts);
    } catch (e) {
      await failJob(job, e instanceof Error ? e : new Error("Indexing failed."));
      return;
    }
    if (batch.length !== texts.length) {
      await failJob(job, new GeminiError("unknown", "The AI sent back the wrong number of vectors."));
      return;
    }
    await appendVectors(job.bookId, slice.from, batch).catch(() => {});
    job.embedded = slice.to;
    await persist(job);
  }
}

/**
 * The gap between two embedding requests.
 *
 * The free tier counts every passage of a batch against the quota, so
 * a book can trip the limit with two requests. The queue waits its
 * turn instead.
 */
let lastRequestAt = 0;

function waitForTurn(gapMs: number): Promise<void> {
  const now = Date.now();
  const due = lastRequestAt + Math.max(0, gapMs);
  lastRequestAt = Math.max(now, due);
  const wait = due - now;
  if (wait <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, wait);
  });
}

/**
 * Embed a batch, trying the reader's other key when the first one is
 * rate limited. A limit is a busy project, not a wrong key.
 */
async function embedWithRotation(
  texts: string[],
): Promise<Float32Array[]> {
  const keys = getApiKeys();
  let lastError: Error | null = null;
  for (const key of keys) {
    try {
      return await embedTexts(texts, "RETRIEVAL_DOCUMENT", key);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Indexing failed.");
      const quota = lastError instanceof GeminiError && lastError.code === "quota";
      if (!quota) throw lastError;
    }
  }
  throw (
    lastError ??
    new GeminiError("no-key", "Add a Gemini key in Settings to index your books.")
  );
}

/**
 * A batch failed — say what happened and when to try again.
 *
 * The states differ because the remedies differ: a network failure is
 * temporary, a bad key will not fix itself, a rate limit needs space.
 */
async function failJob(job: IndexJobRow, e: Error): Promise<void> {
  const code = e instanceof GeminiError ? e.code : "unknown";
  const message = e instanceof Error ? e.message : "Indexing failed.";
  job.lastError = message;
  job.state = "failed";
  const now = Date.now();
  if (code === "network") {
    if (!isOnline()) {
      job.state = "paused";
      job.nextTryAt = 0;
    } else {
      job.nextTryAt = now + 30_000;
    }
  } else if (code === "invalid-key") {
    // The key will not work on the next try either: wait for a new key
    // (or for the reader to press Retry).
    job.nextTryAt = 0;
    skipped.add(job.bookId);
  } else if (code === "quota") {
    // A rate limit is not a broken key: the project is busy. The batch
    // gets smaller, the requests get further apart, and the job waits
    // — it is not counted as a failure, so it never gives up.
    job.attempts += 1;
    job.batch = smallerBatch(job.batch || EMBED_BATCH);
    job.gapMs = biggerGap(job.gapMs || MIN_GAP_MS);
    job.nextTryAt = now + throttleMs(job.attempts);
    job.state = "pending";
  } else {
    job.nextTryAt = now + 60_000;
  }
  if (code !== "quota" && job.attempts >= MAX_ATTEMPTS) {
    // Stop trying on our own — the reader can press Retry.
    job.nextTryAt = Number.MAX_SAFE_INTEGER;
  }
  await persist(job);
  wakeAt(job.nextTryAt);
}

/** Come back to the queue when the next try is due. */
function wakeAt(at: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(at) || at <= 0) return;
  const delay = Math.min(at - Date.now(), 60 * 60 * 1000);
  if (delay < 500) return;
  window.setTimeout(() => kickIndexer(), delay);
}

/** Stop the job for a book (the work already done is kept). */
export function cancelIndexing(bookId: string): void {
  cancelled.add(bookId);
  const job = progress.get(bookId);
  if (job) publish({ ...job, state: "paused" });
}

// ---------------------------------------------------------------------------
// The listeners: the queue wakes up when the phone wakes up.
// ---------------------------------------------------------------------------

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("online", () => kickIndexer());
  window.addEventListener("offline", () => {
    /* the running job pauses itself when its next batch fails */
  });
  document.addEventListener("visibilitychange", () => {
    if (isVisible()) kickIndexer();
  });
}
