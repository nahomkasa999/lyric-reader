import { describe, expect, it } from "vitest";
import {
  buildAskContext,
  findQuote,
  splitQuotes,
} from "../src/lib/askContext";
import type { Item } from "../src/lib/types";

const item = (page: number, text: string, kind: Item["kind"] = "para"): Item => ({
  kind,
  depth: 0,
  text,
  page,
  paraStart: false,
});

const items: Item[] = [
  item(0, "The Midnight Staircase", "heading"),
  item(0, "The house was silent."),
  item(0, "A clock ticked in the hall."),
  item(1, "Take the poker from the study."),
  item(1, "The stairs creaked under his weight."),
  item(2, "He reached the landing at last."),
];

const partsOf = (i: number) => {
  const t = items[i].text;
  return t.includes(",") ? t.split(",").map((s) => s.trim()) : [t];
};

describe("buildAskContext", () => {
  it("marks the current sentence and includes prev/next pages", () => {
    const c = buildAskContext("Sample Book", items, 3);
    expect(c.title).toBe("Sample Book");
    expect(c.page).toBe(2);
    expect(c.pages).toBe(3);
    expect(c.markedPageText).toContain(">>> Take the poker from the study. <<<");
    expect(c.prevPageText).toContain("The house was silent.");
    expect(c.nextPageText).toContain("He reached the landing at last.");
    expect(c.contextText).toContain(">>> Take the poker from the study. <<<");
  });

  it("picks the nearest heading at/before the current item", () => {
    const c = buildAskContext("Sample Book", items, 4);
    expect(c.heading).toBe("The Midnight Staircase");
    expect(c.contextText).toContain("Section: The Midnight Staircase");
  });

  it("has no prev/next text at the book ends", () => {
    const c = buildAskContext("B", items, 0);
    expect(c.prevPageText).toBe("");
    const c2 = buildAskContext("B", items, 5);
    expect(c2.nextPageText).toBe("");
  });

  it("the system instruction pins answers to the passage", () => {
    const c = buildAskContext("B", items, 3);
    expect(c.systemInstruction).toContain("Answer ONLY using the passage");
    expect(c.systemInstruction).toContain("« »");
  });
});

describe("findQuote", () => {
  it("matches a full sentence to item+part 0", () => {
    const hit = findQuote("Take the poker from the study.", items, partsOf);
    expect(hit).toEqual({ item: 3, part: 0 });
  });

  it("falls back to an exact part match", () => {
    const its: Item[] = [
      item(0, "The lamp, broken long ago, stood in the corner."),
    ];
    const parts = (i: number) =>
      i === 0 ? ["The lamp", "broken long ago", "stood in the corner."] : [];
    const hit = findQuote("broken long ago", its, parts);
    expect(hit).toEqual({ item: 0, part: 1 });
  });

  it("returns null when nothing matches exactly", () => {
    expect(findQuote("take the poker", items, partsOf)).toBeNull();
    expect(findQuote("", items, partsOf)).toBeNull();
  });
});

describe("splitQuotes", () => {
  it("splits text and «quotes» into segments", () => {
    const segs = splitQuotes(
      'He did it because «Take the poker from the study.» Indeed.',
    );
    expect(segs).toEqual([
      { kind: "text", text: "He did it because " },
      { kind: "quote", text: "Take the poker from the study." },
      { kind: "text", text: " Indeed." },
    ]);
  });

  it("handles answers with no quotes", () => {
    expect(splitQuotes("Just an answer.")).toEqual([
      { kind: "text", text: "Just an answer." },
    ]);
  });
});
