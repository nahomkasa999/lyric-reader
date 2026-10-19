import { describe, expect, it } from "vitest";
import { resegmentItems, type Item } from "../src/lib/types";
import { splitSentences } from "../src/lib/segment";

const FIXTURE =
  "But first we have to define a term I use throughout this book: “dream client.” A dream client is the prospective client for whom you can create breathtaking, jaw-dropping, earth-shattering value and who allows you to keep some of the value that you create (something you know as “profit”).";

function item(text: string, kind: Item["kind"] = "para", page = 4): Item {
  return { kind, depth: 0, text, page, paraStart: true };
}

describe("resegmentItems", () => {
  it("splits a stored paragraph item merged by the old segmenter", () => {
    const { items, changed } = resegmentItems([item(FIXTURE)], splitSentences);
    expect(changed).toBe(true);
    expect(items.length).toBe(2);
    expect(items[0].text).toBe(
      "But first we have to define a term I use throughout this book: “dream client.”",
    );
    expect(items[1].text.startsWith("A dream client is")).toBe(true);
    // Page inherited from the source item; first sentence keeps paraStart.
    expect(items[0].page).toBe(4);
    expect(items[1].page).toBe(4);
    expect(items[0].paraStart).toBe(true);
    expect(items[1].paraStart).toBe(false);
  });

  it("leaves already-split items, headings and bullets untouched", () => {
    const head = item("Chapter One", "heading");
    const li = item("Buy milk. Buy eggs.", "bullet");
    const para = item("A single sentence stays whole.", "para");
    const { items, changed } = resegmentItems([head, li, para], splitSentences);
    expect(changed).toBe(false);
    expect(items).toEqual([head, li, para]);
  });

  it("is idempotent", () => {
    const once = resegmentItems([item(FIXTURE)], splitSentences);
    const twice = resegmentItems(once.items, splitSentences);
    expect(twice.changed).toBe(false);
    expect(twice.items).toEqual(once.items);
  });

  it("handles empty books", () => {
    expect(resegmentItems([], splitSentences)).toEqual({
      items: [],
      changed: false,
    });
  });
});
