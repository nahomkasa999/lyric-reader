import { describe, expect, it } from "vitest";
import {
  paginate,
  progressOf,
  step,
  trailSentences,
  upcomingSentences,
  type Block,
  type BookDoc,
  type Page,
} from "../src/lib/types";

const S = (text: string) => ({ id: text, text, kind: "para" as const, level: 0 });
const pages: Page[] = [
  { label: "Page 1", sentences: [S("a"), S("b"), S("c")] },
  { label: "Page 2", sentences: [S("d"), S("e")] },
];
const book: BookDoc = {
  id: "b",
  title: "T",
  pages,
  totalSentences: 5,
  createdAt: 0,
  source: "sample",
};

describe("step()", () => {
  it("moves one sentence forward within a page", () => {
    expect(step(pages, { page: 0, sent: 0 }, 1)).toEqual({ page: 0, sent: 1 });
  });

  it("crosses to the next page at the end, clearing the trail", () => {
    expect(step(pages, { page: 0, sent: 2 }, 1)).toEqual({ page: 1, sent: 0 });
  });

  it("clamps at the end of the book", () => {
    expect(step(pages, { page: 1, sent: 1 }, 1)).toEqual({ page: 1, sent: 1 });
  });

  it("crosses back to the previous page's last sentence", () => {
    expect(step(pages, { page: 1, sent: 0 }, -1)).toEqual({ page: 0, sent: 2 });
  });

  it("clamps at the start of the book", () => {
    expect(step(pages, { page: 0, sent: 0 }, -1)).toEqual({ page: 0, sent: 0 });
  });
});

describe("trail / upcoming", () => {
  it("trail holds the already-read sentences of the current page", () => {
    expect(trailSentences(pages, { page: 0, sent: 2 }).map((s) => s.text)).toEqual([
      "a",
      "b",
    ]);
  });

  it("trail is empty at a page start (clean slate after boundary)", () => {
    expect(trailSentences(pages, { page: 1, sent: 0 })).toEqual([]);
  });

  it("trail is fully restored when scrolling back across the boundary", () => {
    // At page 2 start, step back -> page 1 last sentence -> trail = a, b
    const back = step(pages, { page: 1, sent: 0 }, -1);
    expect(back).toEqual({ page: 0, sent: 2 });
    expect(trailSentences(pages, back).map((s) => s.text)).toEqual(["a", "b"]);
  });

  it("upcoming holds the sentences still to come on the page", () => {
    expect(
      upcomingSentences(pages, { page: 0, sent: 0 }).map((s) => s.text),
    ).toEqual(["b", "c"]);
  });
});

describe("paginate()", () => {
  it("chunks sentences into pages of the given size", () => {
    const blocks: Block[] = [
      { kind: "para", level: 0, text: "One. Two. Three. Four. Five." },
    ];
    const ps = paginate(blocks, 2, (t) => t.split(/(?<=[.])\s+/));
    expect(ps.length).toBe(3);
    expect(ps[0].sentences.map((s) => s.text)).toEqual(["One.", "Two."]);
    expect(ps[2].sentences.map((s) => s.text)).toEqual(["Five."]);
  });

  it("keeps headings as their own sentence", () => {
    const blocks: Block[] = [{ kind: "heading", level: 1, text: "Hi there. Wow." }];
    const ps = paginate(blocks, 14, (t) => t.split(" "));
    expect(ps[0].sentences.length).toBe(1);
    expect(ps[0].sentences[0].kind).toBe("heading");
  });
});

describe("progressOf()", () => {
  it("computes overall progress", () => {
    expect(progressOf(book, { page: 0, sent: 0 })).toBe(0);
    expect(progressOf(book, { page: 0, sent: 2 })).toBeCloseTo(2 / 5);
    expect(progressOf(book, { page: 1, sent: 1 })).toBeCloseTo(4 / 5);
  });
});
