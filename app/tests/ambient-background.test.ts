// The ambient background component: it renders behind the reader and Home
// and it must survive every style change without breaking its hook order.
import { describe, it, expect, beforeEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createElement } from "react";
import AmbientBackground from "../src/components/AmbientBackground";
import {
  SettingsProvider,
  useSettings,
  type ReaderSettings,
} from "../src/lib/settings";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let update: ((p: Partial<ReaderSettings>) => void) | null = null;

function Capture() {
  update = useSettings().update;
  return null;
}

async function mount(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        SettingsProvider,
        null,
        createElement(AmbientBackground),
        createElement(Capture),
      ),
    );
  });
  return { container, root };
}

function q<T extends HTMLElement>(container: HTMLElement, id: string): T {
  const el = container.querySelector<T>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing ${id}`);
  return el;
}

function styleOf(el: HTMLElement): string {
  return (el.getAttribute("style") ?? "").toLowerCase();
}

describe("the ambient background", () => {
  beforeEach(() => {
    localStorage.clear();
    update = null;
  });

  it("shows the glow by default", async () => {
    const { container, root } = await mount();
    const glow = q(container, "ambient-glow");
    expect(glow.className).toContain("glow-layer");
    // The green the cycle starts at.
    expect(styleOf(glow)).toContain("--ambient-hue: 120");
    await act(async () => root.unmount());
  });

  it("survives every style change without breaking its hooks", async () => {
    const { container, root } = await mount();

    // Solid: a flat fill, no glow.
    await act(async () => update!({ bgStyle: "solid" }));
    expect(container.querySelector('[data-testid="ambient-glow"]')).toBeNull();
    expect(styleOf(q(container, "ambient-background"))).toMatch(
      /#a6e22e|rgb\(166, 226, 46\)/,
    );

    // Off: pure black.
    await act(async () => update!({ bgStyle: "off" }));
    expect(container.querySelector('[data-testid="ambient-glow"]')).toBeNull();
    expect(styleOf(q(container, "ambient-background"))).toContain("#000000");

    // Back to the gradient: the glow is there again.
    await act(async () => update!({ bgStyle: "gradient" }));
    expect(q(container, "ambient-glow")).toBeTruthy();

    await act(async () => root.unmount());
  });

  it("cycles the hue while alternate, and holds it in one colour", async () => {
    const { container, root } = await mount();
    const glow = q(container, "ambient-glow");

    // Alternate: the animation cycles the hue over minutes.
    expect(glow.style.animation).toContain("ambient-hue-cycle");

    await act(async () => update!({ bgColourMode: "single" }));
    expect(glow.style.animation).not.toContain("ambient-hue-cycle");
    // The glow holds the picked colour.
    expect(glow.className).toContain("glow-single");
    expect(styleOf(glow)).toContain("rgba(166, 226, 46");

    await act(async () => root.unmount());
  });

  it("freezes the glow when the motion is off", async () => {
    const { container, root } = await mount();
    const glow = q(container, "ambient-glow");
    expect(glow.style.animation).toContain("ambient-drift");

    await act(async () => update!({ bgMotion: false }));
    expect(glow.style.animation).toBe("none");

    await act(async () => root.unmount());
  });
});
