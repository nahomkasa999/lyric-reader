// The ambient background recipe: one oversized, heavily blurred colour
// field whose centre sits below the viewport — on screen, a smooth falloff
// with no edge anywhere.
import { describe, it, expect } from "vitest";
import {
  AMBIENT_ALPHA_CAP,
  AMBIENT_CYCLE_SECONDS,
  AMBIENT_HUES,
  AMBIENT_START_HUE,
  glow,
  hexToHue,
  hexToRgb,
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
});

describe("the haze", () => {
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
    expect(dim.style["--ambient-a1"]).toBe("0");
    expect(bright.style["--ambient-a1"]).toBe(String(AMBIENT_ALPHA_CAP));
  });

  it("caps the alpha so the bottom is a haze, not a neon strip", () => {
    // The default intensity of 60 must not reach full colour.
    const def = glow({ mode: "alternate", color: "#A6E22E", intensity: 60 });
    expect(Number(def.style["--ambient-a1"])).toBeLessThan(0.35);
    expect(AMBIENT_ALPHA_CAP).toBeLessThan(1);
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
