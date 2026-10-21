// Amharic (v4.10): the Ethiopic full stop ፡ (U+1361), the semicolon ።
// (U+1362) and the question mark ፧ (U+1367) end a sentence. Amharic
// writes its full stop in runs — ፡፡፡፡ closes a paragraph — and ICU's
// segmenter does not break on ፡ at all, so the marks are split by hand.
import { describe, expect, it } from "vitest";
import { splitSentences } from "../src/lib/segment";
import { chunkText } from "../src/lib/speech";
import { parseTextBlocks } from "../src/lib/structure";

describe("Amharic sentences", () => {
  it("splits on the full stop ፡", () => {
    expect(splitSentences("እንድና ይህ ነው፡ ሌላ ነው፡")).toEqual([
      "እንድና ይህ ነው፡",
      "ሌላ ነው፡",
    ]);
  });

  it("treats the four-dot ending ፡፡፡፡ as ONE ending", () => {
    const out = splitSentences("እንድና ይህ ነው፡፡፡፡ ሌላ ነው፡");
    expect(out).toEqual(["እንድና ይህ ነው፡፡፡፡", "ሌላ ነው፡"]);
    // The text is shown as it was written — the run is not eaten.
    expect(out[0].endsWith("፡፡፡፡")).toBe(true);
  });

  it("splits on ። and ፧ too", () => {
    expect(splitSentences("ምን አለ፧ ዝናትና ደስ አለ።")).toEqual([
      "ምን አለ፧",
      "ዝናትና ደስ አለ።",
    ]);
  });

  it("splits a whole paragraph of Amharic", () => {
    const text =
      "የኢትዮጵያ ታሪክ በጥሩ ቋንቋ የተጻፈ ነው። በዚህ ውስጥ ብዙ ቃላት አሉ፡፡፡፡ ተዘግየው በጥሩ ምርጫ ነው። አሁን ምን አለ፧";
    const out = splitSentences(text);
    expect(out.length).toBe(4);
    expect(out[0]).toBe("የኢትዮጵያ ታሪክ በጥሩ ቋንቋ የተጻፈ ነው።");
    expect(out[1]).toBe("በዚህ ውስጥ ብዙ ቃላት አሉ፡፡፡፡");
    expect(out[3]).toBe("አሁን ምን አለ፧");
  });

  it("does not leave an Amharic paragraph as one wall of text", () => {
    const out = splitSentences(
      "አንድ ነው፡ ሁለት ነው፡ ሶስት ነው፡ አራት ነው፡ አምስት ነው፡",
    );
    expect(out.length).toBe(5);
  });

  it("leaves English exactly as it was", () => {
    expect(
      splitSentences("Dr. Abernathy arrived at nine. He was whistling."),
    ).toEqual(["Dr. Abernathy arrived at nine.", "He was whistling."]);
    expect(splitSentences("Hello world. How are you? Fine!")).toEqual([
      "Hello world.",
      "How are you?",
      "Fine!",
    ]);
  });

  it("keeps a text that starts with marks in one piece", () => {
    const out = splitSentences("፡፡፡፡ ሌላ ነው፡");
    expect(out.length).toBe(1);
  });
});

describe("the phone reading Amharic", () => {
  it("chunks on the Ethiopic marks (Chrome cuts off at 15s)", () => {
    const out = chunkText("እንድና ይህ ነው። ሌላ ነው። ስለዚህ ነው፡፡፡፡ አሁን ምን አለ፧");
    expect(out.length).toBeGreaterThan(1);
    expect(out[0]).toContain("።");
  });
});

describe("an Amharic heading", () => {
  it("is not read as a heading because of its ።", () => {
    const blocks = parseTextBlocks("የመጀመሪያ ምዕራፍ\n\nአንድ ወረቀት በዚህ ጽሑፍ ውስጥ አለ።");
    expect(blocks[0].kind).toBe("para");
  });
});
