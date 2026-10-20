// Regression (Oct 20, 2026): on Nahom's phone the current sentence
// rendered as ONE bright block — the muted/split look was gone — while
// past and upcoming sentences were still dimmed correctly. splitS and
// the .on classes were fine (desktop Chromium computed the muted parts
// at 45% alpha). The one rule that differed from every other reader
// colour rule was .s.cur .pt: it was the only color-mix in the reader
// with a nested CSS max() — calc(max(var(--lr-to, 30), 45) * 1%).
// Browsers that drop that declaration fall back to the build's plain
// `color: var(--lr-ct)` (solid white), so all parts look active.
//
// Fix: the 45 floor is computed in JS (applySettings -> --lr-mto) and
// the CSS uses a plain calc like every other reader colour. These
// tests pin both halves so the max() cannot creep back in.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applySettings, DEFAULT_SETTINGS } from "../src/lib/settings";
import { splitS } from "../src/lib/parts";

describe("muted parts of the current sentence", () => {
  it("the screenshot sentence still splits into parts", () => {
    const s =
      "I shamelessly stole the idea of mind-set, skill set, and tool kit from my friend Gerhard Gschwandtner, the charismatic publisher of Selling Power magazine and, concerning the topics of sales and success, one of the most curious, thoughtful people I know.";
    const parts = splitS(s);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(s);
  });

  it("applySettings floors the muted-part opacity at 45", () => {
    const root = document.documentElement.style;
    applySettings({ ...DEFAULT_SETTINGS, trailOpacity: 30 });
    expect(root.getPropertyValue("--lr-to")).toBe("30");
    expect(root.getPropertyValue("--lr-mto")).toBe("45");
    applySettings({ ...DEFAULT_SETTINGS, trailOpacity: 10 });
    expect(root.getPropertyValue("--lr-mto")).toBe("45");
  });

  it("a higher trail opacity still wins over the floor", () => {
    const root = document.documentElement.style;
    applySettings({ ...DEFAULT_SETTINGS, trailOpacity: 70 });
    expect(root.getPropertyValue("--lr-mto")).toBe("70");
  });

  it(".s.cur .pt uses --lr-mto with no max()/min() inside its color-mix", () => {
    const css = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const block = css.match(/\.s\.cur \.pt \{([^}]*)\}/);
    expect(block).not.toBeNull();
    // Only the declarations count — the block's comment explains the
    // regression and names the old max() form on purpose.
    const declarations = block![1].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).toContain("var(--lr-mto");
    expect(declarations).not.toMatch(/max\(|min\(/);
  });
});
