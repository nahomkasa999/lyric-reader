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
 * then marks the job done.
 */
export function nextBatch(
  total: number,
  embedded: number,
): { from: number; to: number } | null {
  if (embedded >= total) return null;
  const from = Math.max(0, embedded);
  return { from, to: Math.min(total, from + EMBED_BATCH) };
}
