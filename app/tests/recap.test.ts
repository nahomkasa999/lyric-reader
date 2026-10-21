// The recap (v4.13): what the reader has read so far.
//
// The sampling is the part that can spoil a book by accident, so it is
// tested on its own: it must never reach past the reader's page, it
// must keep the last passages, and it must stay inside its budget.
import { describe, it, expect } from "vitest";
import { RECAP_PASSAGES, sampleRecap } from "../src/lib/recap";
import type { StoredChunk } from "../src/lib/vectorStore";

function chunk(n: number, chars = 100): StoredChunk {
  return {
    id: `b1:${n}`,
    bookId: "b1",
    text: `passage ${n} ${"x".repeat(chars)}`,
    heading: "Chapter",
    page: n + 1,
    from: n * 10,
    to: n * 10 + 9,
  };
}

describe("sampling what was read", () => {
  it("keeps the last passages", () => {
    const chunks = [chunk(0), chunk(1), chunk(2), chunk(3), chunk(4)];
    const picked = sampleRecap(chunks, 45);
    expect(picked.length).toBe(5);
    expect(picked[picked.length - 1].id).toBe("b1:4");
    expect(picked.map((c) => c.id)).toContain("b1:3");
  });

  it("ignores the passages after the reader's page", () => {
    const chunks = [chunk(0), chunk(1), chunk(2), chunk(3)];
    const picked = sampleRecap(chunks, 15);
    expect(picked.map((c) => c.id)).toEqual(["b1:0", "b1:1"]);
  });

  it("spreads the sample over the read range", () => {
    const chunks = Array.from({ length: 60 }, (_, i) => chunk(i));
    const picked = sampleRecap(chunks, 600);
    expect(picked.length).toBeLessThanOrEqual(RECAP_PASSAGES);
    // Evenly spread: the first and the last are close to the ends.
    expect(picked[0].from).toBeLessThanOrEqual(chunks[5].from);
    expect(picked[picked.length - 1].from).toBeGreaterThan(
      chunks[chunks.length - 10].from,
    );
  });

  it("stays inside the budget", () => {
    const chunks = Array.from({ length: 40 }, (_, i) => chunk(i, 500));
    const picked = sampleRecap(chunks, 400, 3000);
    const chars = picked.reduce((n, c) => n + c.text.length, 0);
    // The last four are always kept — the budget only thins the rest.
    expect(picked.length).toBeLessThanOrEqual(RECAP_PASSAGES);
    expect(chars).toBeLessThan(3000 + 4 * 500);
  });

  it("says nothing when nothing was read", () => {
    expect(sampleRecap([chunk(0)], -1)).toEqual([]);
    expect(sampleRecap([], 10)).toEqual([]);
  });
});
