import { describe, expect, it } from "vitest";
import { extractTxt } from "../src/lib/extract";
import { splitS } from "../src/lib/parts";

// Bug #2 regression: the user's own pasted text (3 paragraphs) must come
// out of the real TXT/paste import as para items that splitS parts —
// paragraph 2 is one ~200-char sentence and must yield 2 parts so the
// reader can render part 1 bright and part 2 dull.
const P1 =
  "The pace numbers are a calm first guess — if it feels slow or rushed after real reading, tell me and I'll tune the formula.";
const P2 =
  "**One thing you must do:** fully close the app (swipe it away) and reopen — your phone was still running an old build in that split screenshot, and this is how the new one takes over + heals the book.";
const P3 =
  "And still open on your side whenever you get a minute: the `VITE_GEMINI_API_KEY` variable in Vercel + Redeploy, so meanings/Ask run on the app key with zero setup.";

describe("paste import parts long paragraphs (bug #2)", () => {
  it("extractTxt yields 3 para items for his exact text", async () => {
    const book = await extractTxt([P1, P2, P3].join("\n\n"), "t", "paste");
    expect(book.items).toHaveLength(3);
    for (const it of book.items) expect(it.kind).toBe("para");
    expect(book.items[1].text).toHaveLength(200);
  });

  it("splitS parts the 200-char paragraph into 2 (bright + dull)", () => {
    const book = { items: [{ text: P2 }] };
    const parts = splitS(book.items[0].text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(P2);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(160);
  });

  it("short paragraphs stay single-part", async () => {
    const book = await extractTxt([P1, P2, P3].join("\n\n"), "t", "paste");
    expect(splitS(book.items[0].text)).toHaveLength(1);
  });
});
