// The ambient background recipe: a wide rectangle at the bottom of the
// screen, a vertical linear gradient fading out by ~55-60% of the height,
// and a slow wave for its top edge.
import { describe, it, expect } from "vitest";
import {
  AMBIENT_CYCLE_SECONDS,
  AMBIENT_HUES,
  AMBIENT_START_HUE,
  AMBIENT_WAVE_A,
  AMBIENT_WAVE_B,
  glow,
  hexToHue,
  hexToRgb,
  rgba,
} from "../src/lib/ambient";

describe("colour helpers", () => {
  it("reads a hex colour", () => {
    expect(hexToRgb("#A6E22E")).toEqual([166, 226, 46]);
    expect(hexToRgb("not a colour")).toBeNull();
  });

  it("finds the hue of a colour", () => {
    expect(hexToHue("#A6E22E")).toBeCloseTo(80, 0);
    expect(hexToHue("#FF0000")).toBeCloseTo(0, 0);
    expect(hexToHue("#0000FF")).toBeCloseTo(240, 0);
    // A broken colour falls back to the start of the cycle: green.
    expect(hexToHue("nope")).toBe(AMBIENT_START_HUE);
  });

  it("mixes a colour with an alpha", () => {
    expect(rgba("#FF0000", 1)).toBe("rgba(255, 0, 0, 1)");
    expect(rgba("#FF0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });
});

describe("the glow", () => {
  it("holds the picked colour in one-colour mode", () => {
    const g = glow({ mode: "single", color: "#F472B6", intensity: 80 });
    expect(g.className).toContain("ambient-single");
    expect(g.style["--ambient-color"]).toBe("#F472B6");
  });

  it("follows the animated hue while cycling", () => {
    const g = glow({ mode: "alternate", color: "#F472B6", intensity: 60 });
    expect(g.className).toBe("ambient-glow");
    // The cycle starts at green, not at the colour the user picked.
    expect(g.style["--ambient-hue"]).toBe(String(AMBIENT_START_HUE));
  });

  it("scales with the intensity", () => {
    const dim = glow({ mode: "single", color: "#A6E22E", intensity: 0 });
    const bright = glow({ mode: "single", color: "#A6E22E", intensity: 100 });
    // The bottom edge is the strongest stop, the middle one is weaker.
    expect(dim.style["--ambient-a1"]).toBe("0");
    expect(bright.style["--ambient-a1"]).toBe("1");
    expect(dim.style["--ambient-a2"]).toBe("0");
    expect(bright.style["--ambient-a2"]).toBe("0.45");
  });
});

describe("the wave", () => {
  it("is a curve, not a straight line", () => {
    // The top edge is drawn with curves and closes at the bottom.
    expect(AMBIENT_WAVE_A).toMatch(/^M /);
    expect(AMBIENT_WAVE_A).toContain(" C ");
    expect(AMBIENT_WAVE_A).toMatch(/L 1140 620 L -140 620 Z$/);
    expect(AMBIENT_WAVE_B).toMatch(/L 1140 620 L -140 620 Z$/);
  });

  it("has two shapes, half a phase apart", () => {
    expect(AMBIENT_WAVE_A).not.toBe(AMBIENT_WAVE_B);
  });
});

describe("the colour cycle", () => {
  it("runs through green, teal, blue, indigo, purple, pink and amber", () => {
    expect(AMBIENT_HUES).toEqual([120, 180, 220, 250, 290, 330, 40]);
  });

  it("takes 3 to 5 minutes for one full cycle", () => {
    expect(AMBIENT_CYCLE_SECONDS).toBeGreaterThanOrEqual(180);
    expect(AMBIENT_CYCLE_SECONDS).toBeLessThanOrEqual(300);
  });
});
