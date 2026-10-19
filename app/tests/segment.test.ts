import { describe, expect, it } from "vitest";
import { splitSentences } from "../src/lib/segment";

describe("splitSentences", () => {
  it("splits plain sentences", () => {
    expect(splitSentences("Hello world. How are you? Fine!")).toEqual([
      "Hello world.",
      "How are you?",
      "Fine!",
    ]);
  });

  it("does not split on titles like Dr.", () => {
    expect(
      splitSentences("Dr. Abernathy arrived at nine. He was whistling."),
    ).toEqual(["Dr. Abernathy arrived at nine.", "He was whistling."]);
  });

  it("does not split on e.g. / i.e.", () => {
    expect(
      splitSentences("Many tools, e.g. hammers, were missing. He left."),
    ).toEqual(["Many tools, e.g. hammers, were missing.", "He left."]);
  });

  it("does not split decimals like 3.14", () => {
    expect(splitSentences("The value is 3.14. Next line here.")).toEqual([
      "The value is 3.14.",
      "Next line here.",
    ]);
  });

  it("does not split figure references like Fig. 2", () => {
    expect(
      splitSentences("See Fig. 2 for details. It shows the plan."),
    ).toEqual(["See Fig. 2 for details.", "It shows the plan."]);
  });

  it("handles ellipses", () => {
    const out = splitSentences("Wait... what happened? Really!");
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.join(" ")).toContain("Wait...");
  });

  it("handles initials like J. K.", () => {
    expect(splitSentences("J. K. Rowling wrote it. It sold well.")).toEqual([
      "J. K. Rowling wrote it.",
      "It sold well.",
    ]);
  });

  it("collapses whitespace and handles empty input", () => {
    expect(splitSentences("  Hello.   World. ")).toEqual(["Hello.", "World."]);
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   ")).toEqual([]);
  });

  it("keeps a single sentence intact", () => {
    expect(splitSentences("No terminal punctuation here")).toEqual([
      "No terminal punctuation here",
    ]);
  });

  // Regression: quote-ending boundaries (Nahom's $100M Offers passage).
  // `…”` + space + capital must be a sentence end, not a merge.
  it("splits after a sentence ending in a closing curly quote", () => {
    const text =
      "But first we have to define a term I use throughout this book: “dream client.” A dream client is the prospective client for whom you can create breathtaking, jaw-dropping, earth-shattering value and who allows you to keep some of the value that you create (something you know as “profit”).";
    const out = splitSentences(text);
    expect(out.length).toBe(2);
    expect(out[0]).toBe(
      "But first we have to define a term I use throughout this book: “dream client.”",
    );
    expect(out[1].startsWith("A dream client is")).toBe(true);
  });

  it("splits after ?!” closers in quotes", () => {
    expect(splitSentences("She asked “really?” He nodded.")).toEqual([
      "She asked “really?”",
      "He nodded.",
    ]);
    expect(splitSentences('He shouted "stop!" They froze.')).toEqual([
      'He shouted "stop!"',
      "They froze.",
    ]);
  });

  it("splits after a parenthesised sentence end", () => {
    expect(splitSentences("(Like this.) Next one.")).toEqual([
      "(Like this.)",
      "Next one.",
    ]);
  });

  it("does not split abbreviations inside quotes", () => {
    expect(splitSentences('He met “Dr. Smith.” They talked.')).toEqual([
      'He met “Dr. Smith.”',
      "They talked.",
    ]);
  });

  it("does not split a quote that is not a sentence end", () => {
    expect(
      splitSentences("The word “muster” means to gather. Use it well."),
    ).toEqual(["The word “muster” means to gather.", "Use it well."]);
  });
});
