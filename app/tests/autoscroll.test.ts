import { describe, expect, it } from "vitest";
import {
  AUTO_SPEEDS,
  isAutoSpeed,
  nextAutoStep,
  nextSpeed,
  paceMs,
} from "../src/lib/autoscroll";

describe("paceMs", () => {
  it("scales with word count: base 900ms + 340ms per word", () => {
    expect(paceMs("one two three", 1)).toBe(900 + 340 * 3);
    expect(paceMs("one two three four five", 1)).toBe(900 + 340 * 5);
  });

  it("divides by the speed multiplier", () => {
    const text = "one two three four five six seven eight";
    const base = 900 + 340 * 8;
    expect(paceMs(text, 2)).toBeCloseTo(base / 2, 0);
    expect(paceMs(text, 0.75)).toBeCloseTo(base / 0.75, 0);
  });

  it("clamps to 1200–6500ms", () => {
    // 1 word: (900+340)/1 = 1240, above the floor.
    expect(paceMs("hi", 1)).toBe(1240);
    // Empty text would be 900 -> clamped to the floor.
    expect(paceMs("", 1)).toBe(1200);
    // 100 words: 34900 -> clamped to the ceiling.
    expect(paceMs("word ".repeat(100), 1)).toBe(6500);
    // Even at 0.75×, the ceiling holds.
    expect(paceMs("word ".repeat(100), 0.75)).toBe(6500);
    // At 1.5× a short sentence stays above the floor.
    expect(paceMs("one two three", 1.5)).toBeGreaterThanOrEqual(1200);
  });

  it("treats invalid speeds as 1×", () => {
    expect(paceMs("one two three", NaN)).toBe(paceMs("one two three", 1));
    expect(paceMs("one two three", 0)).toBe(paceMs("one two three", 1));
    expect(paceMs("one two three", -2)).toBe(paceMs("one two three", 1));
  });
});

describe("nextSpeed", () => {
  it("cycles 1× → 1.25× → 1.5× → 0.75× → 1×", () => {
    expect(AUTO_SPEEDS).toEqual([1, 1.25, 1.5, 0.75]);
    expect(nextSpeed(1)).toBe(1.25);
    expect(nextSpeed(1.25)).toBe(1.5);
    expect(nextSpeed(1.5)).toBe(0.75);
    expect(nextSpeed(0.75)).toBe(1);
  });

  it("falls back to 1× from an unknown value", () => {
    expect(nextSpeed(2)).toBe(1);
  });
});

describe("isAutoSpeed", () => {
  it("accepts only the four cycle values", () => {
    expect(isAutoSpeed(1)).toBe(true);
    expect(isAutoSpeed(1.5)).toBe(true);
    expect(isAutoSpeed(2)).toBe(false);
    expect(isAutoSpeed("1")).toBe(false);
    expect(isAutoSpeed(undefined)).toBe(false);
  });
});

describe("nextAutoStep", () => {
  const parts = [["a"], ["b", "b2"], ["c"]];

  it("advances part-first, then to the next item", () => {
    expect(nextAutoStep(parts, { item: 1, part: 0 })).toEqual({
      next: { item: 1, part: 1 },
    });
    expect(nextAutoStep(parts, { item: 1, part: 1 })).toEqual({
      next: { item: 2, part: 0 },
    });
  });

  it("reports the end of the book (stays stopped)", () => {
    expect(nextAutoStep(parts, { item: 2, part: 0 })).toEqual({ end: true });
  });

  it("a one-item book ends after its last part", () => {
    expect(nextAutoStep([["only", "one"]], { item: 0, part: 0 })).toEqual({
      next: { item: 0, part: 1 },
    });
    expect(nextAutoStep([["only", "one"]], { item: 0, part: 1 })).toEqual({
      end: true,
    });
  });

  it("an empty book is already at the end", () => {
    expect(nextAutoStep([], { item: 0, part: 0 })).toEqual({ end: true });
  });
});
