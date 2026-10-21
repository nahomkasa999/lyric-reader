// The queue's rules (v4.13) — pure, so they can be tested without a
// database and without a network.
//
// Three decisions live here:
//   · how long to wait before trying a failed job again (backoff);
//   · which job to run next (the queue is fair, oldest first);
//   · which slice of a book to embed next (a fixed batch).
import type { IndexJobRow } from "./indexJobs";

/** How many passages go into one embedding request. */
export const EMBED_BATCH = 40;

/**
 * The smallest batch we will try.
 *
 * Google counts every passage inside a batch against the quota, so a
 * big batch on a small quota is a rate limit. When that happens the
 * batch is halved — until it is small enough to go through.
 */
export const MIN_BATCH = 4;

/** The shortest wait between two embedding requests. */
export const MIN_GAP_MS = 1_200;

/** The longest wait between two embedding requests. */
export const MAX_GAP_MS = 300_000;

/** How many times a job may retry itself before it waits for the reader. */
export const MAX_ATTEMPTS = 8;

/**
 * How long to wait before the next try.
 *
 * 30s, 2m, 5m, 15m — and then 15m forever. The point is not to hammer
 * a rate-limited API: a reader who is offline gets their book indexed
 * when they come back, not a hundred failed requests in the meantime.
 */
export function backoffMs(attempts: number): number {
  const steps = [30_000, 120_000, 300_000, 900_000];
  const i = Math.max(0, Math.floor(attempts));
  return steps[Math.min(i, steps.length - 1)];
}

/**
 * How long to wait after a RATE LIMIT.
 *
 * A limit is not a broken key: it is a busy project. So the wait grows
 * quickly, and it is not counted as a failure — the job is still good.
 */
export function throttleMs(attempts: number): number {
  const step = MIN_GAP_MS * 2 ** Math.max(0, Math.floor(attempts) - 1);
  return Math.min(MAX_GAP_MS, step);
}

/** The next batch size to try, after a rate limit. */
export function smallerBatch(batch: number): number {
  return Math.max(MIN_BATCH, Math.floor(batch / 2));
}

/** The next wait between requests, after a rate limit. */
export function biggerGap(gap: number): number {
  return Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, gap * 2));
}

/** Is this job allowed to run right now? */
export function isEligible(job: IndexJobRow, now: number): boolean {
  if (job.state === "done" || job.state === "paused") return false;
  if (job.state === "failed") return job.nextTryAt <= now;
  // pending, or a "running" row left behind by a reload.
  return true;
}

/**
 * The job to run next, or null.
 *
 * The oldest due job wins: a book that has been waiting longer than
 * another one goes first. `canRun` is the gate — offline, no key or a
 * hidden tab means nothing runs at all.
 */
export function pickJob(
  jobs: IndexJobRow[],
  now: number,
  canRun: boolean,
): IndexJobRow | null {
  if (!canRun) return null;
  const due = jobs.filter((j) => isEligible(j, now));
  if (!due.length) return null;
  due.sort((a, b) => a.nextTryAt - b.nextTryAt || a.updatedAt - b.updatedAt);
  return due[0];
}

/**
 * The slice to embed next.
 *
 * `to` is exclusive. Null when the book is fully embedded — the caller
 * then marks the job done. The batch size shrinks when the API says
 * the batch is too big for the quota.
 */
export function nextBatch(
  total: number,
  embedded: number,
  batch: number = EMBED_BATCH,
): { from: number; to: number } | null {
  if (embedded >= total) return null;
  const from = Math.max(0, embedded);
  const size = Math.max(1, Math.floor(batch));
  return { from, to: Math.min(total, from + size) };
}
