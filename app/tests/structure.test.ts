import { describe, expect, it } from "vitest";
import { parseTextBlocks } from "../src/lib/structure";

describe("parseTextBlocks", () => {
  it("parses paragraphs separated by blank lines", () => {
    const blocks = parseTextBlocks("First para here.\n\nSecond para here.");
    expect(blocks).toEqual([
      { kind: "para", level: 0, text: "First para here." },
      { kind: "para", level: 0, text: "Second para here." },
    ]);
  });

  it("detects markdown headings", () => {
    const blocks = parseTextBlocks("# Title\n\nSome text.");
    expect(blocks[0]).toEqual({ kind: "heading", level: 1, text: "Title" });
    expect(blocks[1].kind).toBe("para");
  });

  it("detects bullet lists with nesting by indent", () => {
    const blocks = parseTextBlocks(
      "- First point.\n  - Nested point.\n    - Deep point.\n- Second point.",
    );
    expect(blocks).toEqual([
      { kind: "bullet", level: 0, text: "First point." },
      { kind: "bullet", level: 1, text: "Nested point." },
      { kind: "bullet", level: 2, text: "Deep point." },
      { kind: "bullet", level: 0, text: "Second point." },
    ]);
  });

  it("detects numbered bullets", () => {
    const blocks = parseTextBlocks("1. One thing.\n2. Another thing.");
    expect(blocks.map((b) => b.kind)).toEqual(["bullet", "bullet"]);
    expect(blocks[0].text).toBe("One thing.");
  });

  it("detects lone short lines as headings", () => {
    const blocks = parseTextBlocks(
      "The Midnight Staircase\n\nA long paragraph follows here with many words in it.",
    );
    expect(blocks[0].kind).toBe("heading");
    expect(blocks[0].text).toBe("The Midnight Staircase");
  });

  it("does not mistake normal sentences for headings", () => {
    const blocks = parseTextBlocks(
      "He walked home slowly in the rain.\n\nAnother line here too.",
    );
    expect(blocks.every((b) => b.kind === "para")).toBe(true);
  });
});
