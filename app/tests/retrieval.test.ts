// The search (v4.13).
//
// Three things must hold:
//   · a book that was never embedded is still found by its words —
//     that is the "don't lose the current pass" guarantee;
//   · a question never reaches past the page the reader is on;
//   · the book on screen wins a tie, so its passages come first.
import { describe, it, expect } from "vitest";
import { rankPassages, type RetrieveOpts } from "../src/lib/retrieval";
import type { StoredChunk } from "../src/lib/vectorStore";
import { wordsOf } from "../src/lib/vectorScore";

function chunk(over: Partial<StoredChunk> = {}): StoredChunk {
  const text = over.text ?? "The crash happened at the corner of 30th Street.";
  return {
    id: "b1:0",
    bookId: "b1",
    text,
    heading: "Chapter 3",
    page: 4,
    from: 10,
    to: 12,
    w: wordsOf(text),
    ...over,
  };
}

const opts: RetrieveOpts = {};

describe("the two lanes", () => {
  it("finds a book that was never embedded", () => {
    const chunks = [chunk()];
    const hits = rankPassages(chunks, new Map(), "what happened on 30th street", opts);
    expect(hits).toHaveLength(1);
    expect(hits[0].chunk.id).toBe("b1:0");
    expect(hits[0].lexical).toBeGreaterThan(0);
    expect(hits[0].semantic).toBe(0);
  });

  it("finds nothing when nothing matches", () => {
    const hits = rankPassages([chunk()], new Map(), "how did the fish sleep", opts);
    expect(hits).toEqual([]);
  });

  it("computes the words of a passage that has none", () => {
    const old = chunk();
    delete old.w;
    const hits = rankPassages([old], new Map(), "30th street crash", opts);
    expect(hits).toHaveLength(1);
  });

  it("uses the vector when there is one", () => {
    const vectors = new Map([["b1:0", new Float32Array([1, 0, 0])]]);
    const hits = rankPassages(
      [chunk({ text: "anything", w: [] })],
      vectors,
      "what happened",
      opts,
      new Float32Array([1, 0, 0]),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].semantic).toBeCloseTo(1, 5);
  });
});

describe("the boundary", () => {
  const later = chunk({
    id: "b1:9",
    text: "The ending reveals that the brother was dead all along.",
    from: 300,
    to: 310,
  });
  const now = chunk({ id: "b1:1", text: "The brother left the house that morning." });

  it("drops the passages after the reader's page", () => {
    const hits = rankPassages(
      [now, later],
      new Map(),
      "brother house morning",
      { bookId: "b1", maxItem: 120 },
    );
    expect(hits.map((h) => h.chunk.id)).toEqual(["b1:1"]);
  });

  it("keeps the passages of the other books", () => {
    const other = chunk({
      id: "b2:0",
      bookId: "b2",
      text: "The brother left the house that morning.",
      from: 900,
    });
    const hits = rankPassages(
      [other],
      new Map(),
      "brother house morning",
      { bookId: "b1", maxItem: 120 },
    );
    expect(hits.map((h) => h.chunk.id)).toEqual(["b2:0"]);
  });

  it("shows everything when the reader allows spoilers", () => {
    const hits = rankPassages(
      [later],
      new Map(),
      "brother dead",
      { bookId: "b1" },
    );
    expect(hits).toHaveLength(1);
  });
});

describe("the book on screen", () => {
  it("wins the tie", () => {
    const mine = chunk({ id: "b1:0", text: "the same words here" });
    const other = chunk({ id: "b2:0", bookId: "b2", text: "the same words here" });
    const hits = rankPassages([other, mine], new Map(), "same words here", {
      bookId: "b1",
    });
    expect(hits[0].chunk.id).toBe("b1:0");
  });
});
