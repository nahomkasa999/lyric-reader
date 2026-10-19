import { describe, expect, it } from "vitest";
import {
  dayKey,
  dayLabel,
  decorateText,
  groupByDay,
} from "../src/lib/vocab";
import type { VocabRecord } from "../src/lib/db";

const rec = (over: Partial<VocabRecord> & { id: string }): VocabRecord => ({
  bookId: "b1",
  text: "lantern",
  norm: "lantern",
  defs: ["noun — A portable lamp."],
  bookTitle: "Sample",
  page: 1,
  item: 0,
  part: 0,
  sentence: "He lit the lantern.",
  savedAt: Date.now(),
  dayKey: dayKey(Date.now()),
  ...over,
});

describe("dayKey / dayLabel", () => {
  it("produces a local YYYY-MM-DD key", () => {
    expect(dayKey(new Date(2026, 9, 19, 8, 0).getTime())).toBe("2026-10-19");
  });
  it("labels today and yesterday", () => {
    const today = dayKey(Date.now());
    expect(dayLabel(today, today)).toBe("Today");
    const y = new Date(today + "T12:00:00");
    y.setDate(y.getDate() - 1);
    const yk = dayKey(y.getTime());
    expect(dayLabel(yk, today)).toBe("Yesterday");
  });
  it("labels older days as 'Mon 12 Oct'", () => {
    expect(dayLabel("2026-10-12", "2026-10-19")).toBe("Mon 12 Oct");
  });
});

describe("groupByDay", () => {
  it("groups newest day first, newest records first inside", () => {
    const a = rec({ id: "b1:lantern", savedAt: 1000, dayKey: "2026-10-18" });
    const b = rec({ id: "b1:poker", text: "poker", norm: "poker", savedAt: 2000, dayKey: "2026-10-19" });
    const c = rec({ id: "b1:stair", text: "stair", norm: "stair", savedAt: 500, dayKey: "2026-10-19" });
    const groups = groupByDay([a, b, c]);
    expect(groups.map((g) => g.key)).toEqual(["2026-10-19", "2026-10-18"]);
    expect(groups[0].records.map((r) => r.norm)).toEqual(["poker", "stair"]);
    expect(groups[0].label).toBe(dayLabel("2026-10-19", dayKey(Date.now())));
  });
  it("returns no groups for no records", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("decorateText", () => {
  it("marks case-insensitive word-boundary matches", () => {
    const runs = decorateText("He lit the Lantern.", ["lantern"]);
    expect(runs).toEqual([
      { match: false, text: "He lit the " },
      { match: true, text: "Lantern" },
      { match: false, text: "." },
    ]);
  });
  it("does not match inside other words", () => {
    const runs = decorateText("The cat sat.", ["at"]);
    expect(runs.every((r) => !r.match)).toBe(true);
  });
  it("prefers the longest norm for overlapping phrases", () => {
    const runs = decorateText("the state of the art design", [
      "state",
      "state of the art",
    ]);
    const matched = runs.filter((r) => r.match).map((r) => r.text);
    expect(matched).toEqual(["state of the art"]);
  });
  it("returns the whole text unmatched with no usable norms", () => {
    expect(decorateText("hello", [])).toEqual([
      { match: false, text: "hello" },
    ]);
    expect(decorateText("hello", ["  "])).toEqual([
      { match: false, text: "hello" },
    ]);
  });
});
