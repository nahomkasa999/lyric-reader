import { describe, expect, it } from "vitest";
import { buildOutline, filterOutline, outlineIndexAt } from "../src/lib/outline";
import type { Item } from "../src/lib/types";

function item(
  text: string,
  kind: Item["kind"] = "para",
  depth = 0,
  page = 0,
): Item {
  return { kind, depth, text, page, paraStart: false };
}

const book: Item[] = [
  item("The Midnight Staircase", "heading", 1, 0),
  item("The old grandfather clock struck midnight.", "para", 0, 0),
  item("The rain beat against the windowpane.", "para", 0, 0),
  item("What He Knew", "heading", 2, 1),
  item("The house had three ways in.", "para", 0, 1),
  item("The Rules of the Stairs", "heading", 1, 2),
  item("Never run on stairs in the dark.", "para", 0, 2),
];

describe("buildOutline", () => {
  it("uses the headings when the book has them", () => {
    const out = buildOutline(book);
    expect(out.map((e) => e.text)).toEqual([
      "The Midnight Staircase",
      "What He Knew",
      "The Rules of the Stairs",
    ]);
    expect(out[0].item).toBe(0);
    expect(out[1].item).toBe(3);
    expect(out[1].page).toBe(2);
  });

  it("keeps the heading level, capped at three", () => {
    const out = buildOutline([
      item("One", "heading", 1),
      item("Two", "heading", 5),
      item("Three", "heading", 9),
    ]);
    expect(out.map((e) => e.level)).toEqual([1, 3, 3]);
  });

  it("shows the line that opens the chapter as a hint", () => {
    const out = buildOutline(book);
    expect(out[0].hint).toBe("The old grandfather clock struck midnight.");
    expect(out[1].hint).toBe("The house had three ways in.");
  });

  it("falls back to the pages when the book has no headings", () => {
    const out = buildOutline([
      item("One", "para", 0, 0),
      item("Two", "para", 0, 0),
      item("Three", "para", 0, 1),
      item("Four", "para", 0, 2),
    ]);
    expect(out.map((e) => e.text)).toEqual(["Page 1", "Page 2", "Page 3"]);
    expect(out.map((e) => e.item)).toEqual([0, 2, 3]);
    expect(out[0].kind).toBe("page");
    expect(out[0].hint).toBe("One");
  });

  it("is empty for an empty book", () => {
    expect(buildOutline([])).toEqual([]);
  });
});

describe("outlineIndexAt", () => {
  const out = buildOutline(book);

  it("finds the chapter a position sits in", () => {
    expect(outlineIndexAt(out, 0)).toBe(0);
    expect(outlineIndexAt(out, 2)).toBe(0);
    expect(outlineIndexAt(out, 3)).toBe(1);
    expect(outlineIndexAt(out, 6)).toBe(2);
  });

  it("is -1 before the first chapter", () => {
    expect(outlineIndexAt(out, -1)).toBe(-1);
    expect(outlineIndexAt([], 3)).toBe(-1);
  });
});

describe("filterOutline", () => {
  const out = buildOutline(book);

  it("returns everything for an empty query", () => {
    expect(filterOutline(out, "  ")).toHaveLength(3);
  });

  it("matches the title and the hint, case-insensitively", () => {
    expect(filterOutline(out, "stairs").map((e) => e.text)).toEqual([
      "The Rules of the Stairs",
    ]);
    expect(filterOutline(out, "three ways").map((e) => e.text)).toEqual([
      "What He Knew",
    ]);
  });

  it("is empty when nothing matches", () => {
    expect(filterOutline(out, "zzzz")).toEqual([]);
  });
});
