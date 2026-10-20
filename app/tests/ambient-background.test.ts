// The ambient background component: the glow behind the reader and Home.
// It must survive every style change without breaking its hook order, and
// it must not draw a shape — no edges anywhere.
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

/** The glow is a canvas when the device has WebGL, and the CSS haze when
 *  it does not. Both are the same look. */
function glowOf(container: HTMLElement): Element | null {
  return (
    container.querySelector('[data-testid="ambient-canvas"]') ??
    container.querySelector('[data-testid="ambient-haze"]')
  );
}

describe("the ambient background", () => {
  beforeEach(() => {
    localStorage.clear();
    update = null;
  });

  it("shows the glow by default", async () => {
    const { container, root } = await mount();
    const glow = q(container, "ambient-glow");
    expect(glow.className).toContain("ambient-glow");
    // The green the cycle starts at.
    expect(styleOf(glow)).toContain("--ambient-hue: 120");
    expect(glowOf(container)).toBeTruthy();
    await act(async () => root.unmount());
  });

  it("draws no shape — no edges, no svg, nothing to show a line", async () => {
    const { container, root } = await mount();
    // The glow is a shader or one blurred field: there is no path, no clip
    // and no svg that could draw a boundary.
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelector("clip-path")).toBeNull();
    const haze = container.querySelector('[data-testid="ambient-haze"]');
    if (haze) expect(haze.getAttribute("style")).toBeNull();
    await act(async () => root.unmount());
  });

  it("survives every style change without breaking its hooks", async () => {
    const { container, root } = await mount();

    // Solid: a flat fill, no glow.
    await act(async () => update!({ bgStyle: "solid" }));
    expect(glowOf(container)).toBeNull();
    expect(styleOf(q(container, "ambient-background"))).toMatch(
      /#a6e22e|rgb\(166, 226, 46\)/,
    );

    // Off: pure black.
    await act(async () => update!({ bgStyle: "off" }));
    expect(glowOf(container)).toBeNull();
    expect(styleOf(q(container, "ambient-background"))).toContain("#000000");

    // Back to the gradient: the glow is there again.
    await act(async () => update!({ bgStyle: "gradient" }));
    expect(glowOf(container)).toBeTruthy();

    await act(async () => root.unmount());
  });

  it("cycles the hue while alternate, and holds it in one colour", async () => {
    const { container, root } = await mount();
    const glow = q(container, "ambient-glow");

    // Alternate: the cycle runs.
    expect(glow.className).not.toContain("ambient-single");

    await act(async () => update!({ bgColourMode: "single" }));
    expect(glow.className).toContain("ambient-single");
    // The glow holds the picked colour.
    expect(styleOf(glow)).toContain("--ambient-color: #a6e22e");

    await act(async () => root.unmount());
  });

  it("freezes the glow when the motion is off", async () => {
    const { container, root } = await mount();
    const glow = q(container, "ambient-glow");
    expect(glow.className).not.toContain("ambient-frozen");

    await act(async () => update!({ bgMotion: false }));
    // Frozen: the colour cycle and the drift both stop.
    expect(glow.className).toContain("ambient-frozen");

    await act(async () => root.unmount());
  });
});
