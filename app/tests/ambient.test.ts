// The ambient recipe: the colours, the cycle and the strength.
// These are the numbers the shader draws with, so they are pinned here.
import { describe, it, expect } from "vitest";
import {
  AMBIENT_CYCLE_SECONDS,
  AMBIENT_DEPTH,
  AMBIENT_GAIN_CAP,
  AMBIENT_HUES,
  AMBIENT_START_HUE,
  ambientCycleStyles,
  gainFor,
  glow,
  hexToHsl,
  hexToHue,
  hexToRgb,
  hueAt,
  palette,
  tones,
  tonesFromHex,
} from "../src/lib/ambient";

/** The hue of a colour the recipe built, in degrees. */
function hueOf(c: number[]): number {
  const [r, g, b] = c;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  if (max === r) return ((g - b) / d + (g < b ? 6 : 0)) * 60;
  if (max === g) return ((b - r) / d + 2) * 60;
  return ((r - g) / d + 4) * 60;
}

describe("the colours of the glow", () => {
  it("reads a hex colour", () => {
    expect(hexToRgb("#A6E22E")).toEqual([166, 226, 46]);
    expect(hexToRgb("nope")).toBeNull();
  });

  it("finds the hue of a colour", () => {
    expect(Math.round(hexToHue("#A6E22E"))).toBe(80);
    expect(Math.round(hexToHue("#5B4FE9"))).toBe(245);
    // A colour it cannot read stays green.
    expect(hexToHue("garbage")).toBe(AMBIENT_START_HUE);
  });

  it("keeps the hue of a picked colour", () => {
    const [h, s, l] = hexToHsl("#F472B6");
    expect(Math.round(h)).toBe(329);
    expect(s).toBeGreaterThan(0.5);
    expect(l).toBeGreaterThan(0.5);
    // The glow carries that hue, at the same level as the cycling glow.
    const t = tonesFromHex("#F472B6");
    expect(hueOf(t.main)).toBeCloseTo(h, 0);
  });

  it("runs the ramp from teal to yellow-green", () => {
    const t = tones(120);
    // Teal at the top of the light, the body, the accent below.
    expect(hueOf(t.deep)).toBeCloseTo(168, 0);
    expect(hueOf(t.main)).toBeCloseTo(112, 0);
    expect(hueOf(t.bright)).toBeCloseTo(74, 0);
    // The accent is the warmest of the three.
    expect(t.bright[0]).toBeGreaterThan(t.main[0]);
  });

  it("caps the strength so the glow stays a haze", () => {
    expect(gainFor(0)).toBe(0);
    expect(gainFor(60)).toBeGreaterThan(0);
    expect(gainFor(100)).toBeCloseTo(AMBIENT_GAIN_CAP, 3);
    expect(gainFor(500)).toBeCloseTo(AMBIENT_GAIN_CAP, 3);
    expect(gainFor(-20)).toBe(0);
  });
});

describe("the colour cycle", () => {
  it("starts and ends on green", () => {
    expect(hueAt(0)).toBeCloseTo(AMBIENT_START_HUE, 3);
    expect(hueAt(AMBIENT_CYCLE_SECONDS)).toBeCloseTo(AMBIENT_START_HUE, 3);
  });

  it("has many stops and walks the whole wheel", () => {
    expect(AMBIENT_HUES.length).toBeGreaterThanOrEqual(15);
    const seen = new Set<number>();
    for (let i = 0; i <= 200; i++) {
      seen.add(Math.round(hueAt((i / 200) * AMBIENT_CYCLE_SECONDS)));
    }
    // It passes through most of the wheel, not a corner of it.
    expect(seen.size).toBeGreaterThan(40);
  });

  it("crosses the middle of the wheel the short way", () => {
    // Rose (350) → red (5) goes up through 0, not back through 200.
    const i = AMBIENT_HUES.indexOf(350);
    const t = ((i + 0.5) / AMBIENT_HUES.length) * AMBIENT_CYCLE_SECONDS;
    const h = hueAt(t);
    expect(h).toBeGreaterThan(350);
    expect(h).toBeLessThan(360);
  });

  it("writes the same cycle into the CSS fallback", () => {
    const css = ambientCycleStyles();
    expect(css).toContain("@keyframes ambient-hue-cycle");
    expect(css).toContain(`--ambient-cycle: ${AMBIENT_CYCLE_SECONDS}s`);
    for (const h of AMBIENT_HUES) {
      expect(css).toContain(`--ambient-hue: ${h}`);
    }
  });
});

describe("the palette of a frame", () => {
  it("cycles the hue in alternate and holds it in one colour", () => {
    const a = palette({
      mode: "alternate",
      color: "#A6E22E",
      intensity: 60,
      elapsed: 0,
    });
    const b = palette({
      mode: "alternate",
      color: "#A6E22E",
      intensity: 60,
      elapsed: 200,
    });
    expect(a.hue).not.toBeCloseTo(b.hue, 1);

    const s1 = palette({
      mode: "single",
      color: "#A6E22E",
      intensity: 60,
      elapsed: 0,
    });
    const s2 = palette({
      mode: "single",
      color: "#A6E22E",
      intensity: 60,
      elapsed: 200,
    });
    expect(s1.hue).toBeCloseTo(s2.hue, 5);
    expect(s1.main).toEqual(s2.main);
  });

  it("reaches about half the screen", () => {
    expect(AMBIENT_DEPTH).toBeGreaterThan(0.4);
    expect(AMBIENT_DEPTH).toBeLessThan(0.5);
  });
});

describe("the CSS fallback", () => {
  it("gets the class and the values it paints with", () => {
    const g = glow({ mode: "alternate", color: "#A6E22E", intensity: 60 });
    expect(g.className).toBe("ambient-glow");
    expect(g.style["--ambient-hue"]).toBe("120");
    expect(g.style["--ambient-color"]).toBe("#A6E22E");
    expect(Number(g.style["--ambient-a1"])).toBeGreaterThan(0);

    const single = glow({ mode: "single", color: "#A6E22E", intensity: 60 });
    expect(single.className).toContain("ambient-single");
  });
});
