import { describe, expect, it } from "vitest";
import { splitS } from "../src/lib/parts";

describe("splitS()", () => {
  it("does not split sentences of 130 chars or less", () => {
    const s = "x".repeat(130);
    expect(splitS(s)).toEqual([s]);
    expect(splitS("Short sentence.")).toEqual(["Short sentence."]);
  });

  it("splits a ~200-char sentence into 2 parts at the comma", () => {
    const s = "A".repeat(60) + ", " + "B".repeat(138);
    expect(s.length).toBe(200);
    const parts = splitS(s);
    expect(parts.length).toBe(2);
    // Cut lands right after the comma (candidate = index+1)
    expect(parts[0]).toBe("A".repeat(60) + ",");
    expect(parts[1]).toBe(" " + "B".repeat(138));
    expect(parts.join("")).toBe(s);
  });

  it("splits a long sentence into 3 parts at clause boundaries", () => {
    // 360 chars, commas near the 120 / 240 ideals
    const s =
      "a".repeat(115) +
      ", " +
      "b".repeat(124) +
      ", " +
      "c".repeat(117);
    expect(s.length).toBe(360);
    const parts = splitS(s);
    expect(parts.length).toBe(3);
    expect(parts.join("")).toBe(s);
    // Every part is substantial (min-part rule: 25, except the join check)
    for (const p of parts) expect(p.trim().length).toBeGreaterThanOrEqual(25);
  });

  it("falls back to a space when no clause boundary is near the cut", () => {
    // 200 chars, no commas/semicolons at all
    const s = "word ".repeat(40).trimEnd();
    const parts = splitS(s);
    expect(parts.length).toBe(2);
    expect(parts.join("")).toBe(s);
    for (const p of parts) expect(p.trim().length).toBeGreaterThanOrEqual(25);
  });

  it("joins back to the original for a realistic long sentence", () => {
    const s =
      "He counted the sounds the way his father had taught him: one for the wind, two for the house settling, three for trouble, and then he waited in the dark for the fourth sound that never came at all.";
    expect(s.length).toBeGreaterThan(130);
    const parts = splitS(s);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(s);
  });
});
