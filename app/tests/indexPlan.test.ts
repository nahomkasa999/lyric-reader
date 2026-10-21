// The queue's rules (v4.13).
//
// These are the numbers that decide whether a book ever gets indexed:
// how long the queue waits before trying again, which job goes first,
// and how big a batch is.
import { describe, it, expect } from "vitest";
import {
  EMBED_BATCH,
  MAX_ATTEMPTS,
  backoffMs,
  nextBatch,
  pickJob,
} from "../src/lib/indexPlan";
import type { IndexJobRow } from "../src/lib/indexJobs";

function job(over: Partial<IndexJobRow> = {}): IndexJobRow {
  return {
    bookId: "b1",
    state: "pending",
    embedded: 0,
    total: 10,
    attempts: 0,
    lastError: null,
    updatedAt: 0,
    nextTryAt: 0,
    ...over,
  };
}

describe("the backoff", () => {
  it("waits longer after every failure", () => {
    expect(backoffMs(0)).toBe(30_000);
    expect(backoffMs(1)).toBe(120_000);
    expect(backoffMs(2)).toBe(300_000);
    expect(backoffMs(3)).toBe(900_000);
  });

  it("stops growing after the fourth failure", () => {
    expect(backoffMs(4)).toBe(900_000);
    expect(backoffMs(40)).toBe(900_000);
  });
});

describe("which job runs next", () => {
  it("runs nothing when the queue may not run", () => {
    const jobs = [job(), job({ bookId: "b2" })];
    expect(pickJob(jobs, 1000, false)).toBeNull();
  });

  it("ignores the books that are done or paused", () => {
    const jobs = [
      job({ bookId: "done", state: "done" }),
      job({ bookId: "paused", state: "paused" }),
    ];
    expect(pickJob(jobs, 1000, true)).toBeNull();
  });

  it("ignores a job whose time has not come yet", () => {
    const jobs = [job({ state: "failed", nextTryAt: 5000 })];
    expect(pickJob(jobs, 1000, true)).toBeNull();
    expect(pickJob(jobs, 6000, true)).not.toBeNull();
  });

  it("takes the oldest due job first", () => {
    const jobs = [
      job({ bookId: "new", state: "pending", nextTryAt: 0, updatedAt: 50 }),
      job({
        bookId: "old",
        state: "failed",
        nextTryAt: 0,
        updatedAt: 10,
      }),
    ];
    expect(pickJob(jobs, 1000, true)?.bookId).toBe("old");
  });

  it("takes a job left running by a reload", () => {
    const jobs = [job({ state: "running" })];
    expect(pickJob(jobs, 1000, true)?.bookId).toBe("b1");
  });

  it("returns nothing when there is nothing to do", () => {
    expect(pickJob([], 1000, true)).toBeNull();
  });
});

describe("the next batch", () => {
  it("cuts the book into batches of forty", () => {
    expect(nextBatch(100, 0)).toEqual({ from: 0, to: EMBED_BATCH });
    expect(nextBatch(100, 40)).toEqual({ from: 40, to: 80 });
    expect(nextBatch(100, 80)).toEqual({ from: 80, to: 100 });
  });

  it("stops at the end of the book", () => {
    expect(nextBatch(900, 880)).toEqual({ from: 880, to: 900 });
    expect(nextBatch(10, 10)).toBeNull();
    expect(nextBatch(10, 20)).toBeNull();
  });

  it("gives up after enough failures", () => {
    expect(MAX_ATTEMPTS).toBeGreaterThan(0);
  });
});
