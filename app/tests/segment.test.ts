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
});
