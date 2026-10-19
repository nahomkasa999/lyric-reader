import { describe, expect, it } from "vitest";
import {
  assignPages,
  migratePosition,
  paginateBlocks,
  progressOf,
  stepParts,
  type Block,
  type BookDoc,
  type Item,
} from "../src/lib/types";

const P = (over: Partial<Item> = {}): Item => ({
  kind: "para",
  depth: 0,
  text: "x",
  page: 0,
  paraStart: false,
  ...over,
});

describe("paginateBlocks() — the user's page rule", () => {
  it("starts a new page at a heading", () => {
    const blocks: Block[] = [
      { kind: "heading", level: 1, text: "Chapter One" },
      { kind: "para", level: 0, text: "One. Two." },
      { kind: "heading", level: 1, text: "Chapter Two" },
      { kind: "para", level: 0, text: "Three." },
    ];
    const items = paginateBlocks(blocks, (t) => t.split(/(?<=[.])\s+/));
    expect(items.map((i) => i.page)).toEqual([0, 0, 0, 1, 1]);
    expect(items[0].kind).toBe("heading");
    expect(items[3].kind).toBe("heading");
  });

  it("caps pages at 7 items", () => {
    const blocks: Block[] = [
      { kind: "para", level: 0, text: Array.from({ length: 10 }, (_, i) => `S${i}.`).join(" ") },
    ];
    const items = paginateBlocks(blocks, (t) => t.split(/(?<=[.])\s+/));
    expect(items.length).toBe(10);
    expect(items.slice(0, 7).every((i) => i.page === 0)).toBe(true);
    expect(items.slice(7).every((i) => i.page === 1)).toBe(true);
  });

  it("keeps headings whole (one item) and marks paragraph starts", () => {
    const blocks: Block[] = [
      { kind: "heading", level: 1, text: "Hi there. Wow." },
      { kind: "para", level: 0, text: "First. Second." },
    ];
    const items = paginateBlocks(blocks, (t) => t.split(/(?<=[.])\s+/));
    expect(items[0]).toMatchObject({ kind: "heading", text: "Hi there. Wow." });
    expect(items[1]).toMatchObject({ kind: "para", paraStart: true });
    expect(items[2]).toMatchObject({ kind: "para", paraStart: false });
  });

  it("assignPages never leaves an empty book", () => {
    expect(assignPages([])).toEqual([]);
  });
});

describe("stepParts() — per-part stepping", () => {
  // items: [2 parts][1 part][3 parts]
  const parts = [["a1", "a2"], ["b1"], ["c1", "c2", "c3"]];

  it("moves part-first within an item", () => {
    expect(stepParts(parts, { item: 0, part: 0 }, 1)).toEqual({ item: 0, part: 1 });
  });

  it("moves to the next item at part 0", () => {
    expect(stepParts(parts, { item: 0, part: 1 }, 1)).toEqual({ item: 1, part: 0 });
  });

  it("going back lands on the previous item's LAST part", () => {
    expect(stepParts(parts, { item: 2, part: 0 }, -1)).toEqual({ item: 1, part: 0 });
    expect(stepParts(parts, { item: 1, part: 0 }, -1)).toEqual({ item: 0, part: 1 });
  });

  it("clamps at both book ends", () => {
    expect(stepParts(parts, { item: 2, part: 2 }, 1)).toEqual({ item: 2, part: 2 });
    expect(stepParts(parts, { item: 0, part: 0 }, -1)).toEqual({ item: 0, part: 0 });
  });
});

describe("progressOf() — item-based", () => {
  const book = (n: number): BookDoc => ({
    id: "b",
    title: "T",
    items: Array.from({ length: n }, (_, i) => P({ text: `s${i}` })),
    totalSentences: n,
    createdAt: 0,
    source: "sample",
  });

  it("is 0 at the start and approaches 1 at the end", () => {
    const b = book(5);
    expect(progressOf(b, { item: 0, part: 0 })).toBe(0);
    expect(progressOf(b, { item: 2, part: 0 })).toBeCloseTo(2 / 4);
    expect(progressOf(b, { item: 4, part: 0 })).toBeCloseTo(1);
  });
});

describe("migratePosition()", () => {
  const items = [
    P({ page: 0, text: "a" }),
    P({ page: 0, text: "b" }),
    P({ page: 1, text: "c" }),
  ];

  it("passes new positions through", () => {
    expect(migratePosition(items, { item: 2, part: 1 })).toEqual({ item: 2, part: 1 });
  });

  it("converts old {page, sent} records to the first item of that page", () => {
    expect(migratePosition(items, { page: 1, sent: 0 })).toEqual({ item: 2, part: 0 });
    expect(migratePosition(items, { page: 0, sent: 1 })).toEqual({ item: 0, part: 0 });
  });

  it("clamps out-of-range saved positions", () => {
    expect(migratePosition(items, { item: 99, part: 0 })).toEqual({ item: 2, part: 0 });
  });
});
