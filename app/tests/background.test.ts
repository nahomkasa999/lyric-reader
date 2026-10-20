import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_SETTINGS, load } from "../src/lib/settings";

describe("ambient background settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults applied when storage empty", () => {
    const s = load();
    expect(s.bgStyle).toBe(DEFAULT_SETTINGS.bgStyle);
    expect(s.bgColourMode).toBe(DEFAULT_SETTINGS.bgColourMode);
    expect(s.bgColor).toBe(DEFAULT_SETTINGS.bgColor);
    expect(s.bgMotion).toBe(DEFAULT_SETTINGS.bgMotion);
    expect(s.bgIntensity).toBe(DEFAULT_SETTINGS.bgIntensity);
  });

  it("each new field persists and reloads", () => {
    localStorage.setItem(
      "lyric-reader.settings-v1",
      JSON.stringify({
        bgStyle: "solid",
        bgColourMode: "single",
        bgColor: "#FF0000",
        bgMotion: false,
        bgIntensity: 80,
      }),
    );
    const s = load();
    expect(s.bgStyle).toBe("solid");
    expect(s.bgColourMode).toBe("single");
    expect(s.bgColor).toBe("#FF0000");
    expect(s.bgMotion).toBe(false);
    expect(s.bgIntensity).toBe(80);
  });

  it("corrupt/invalid stored values fall back to defaults", () => {
    localStorage.setItem(
      "lyric-reader.settings-v1",
      JSON.stringify({
        bgStyle: "nope",
        bgColourMode: "both",
        bgColor: "red",
        bgMotion: "true",
        bgIntensity: 200,
      }),
    );
    const s = load();
    expect(s.bgStyle).toBe(DEFAULT_SETTINGS.bgStyle);
    expect(s.bgColourMode).toBe(DEFAULT_SETTINGS.bgColourMode);
    expect(s.bgColor).toBe(DEFAULT_SETTINGS.bgColor);
    expect(s.bgMotion).toBe(DEFAULT_SETTINGS.bgMotion);
    expect(s.bgIntensity).toBe(DEFAULT_SETTINGS.bgIntensity);
  });
});
