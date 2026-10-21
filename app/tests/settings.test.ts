// The Settings page (grouped glass sections): the Background group writes
// straight into the persisted settings, and the old testids still work.
import { describe, it, expect, beforeEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createElement } from "react";
import Settings from "../src/components/Settings";
import { SettingsProvider } from "../src/lib/settings";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The build stamp is injected by Vite at build time; in tests it is a
// plain global.
(globalThis as unknown as { __BUILD_ID__: string }).__BUILD_ID__ = "test-build";

async function mount(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        SettingsProvider,
        null,
        createElement(Settings, { onBack: () => {} }),
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

function stored(): Record<string, unknown> {
  const raw = localStorage.getItem("lyric-reader.settings-v1");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

describe("settings page", () => {
  beforeEach(() => {
    localStorage.clear();
    // A speech engine, so the read-aloud controls are live.
    (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = {
      getVoices: () => [
        {
          voiceURI: "urn:one",
          name: "Ada",
          lang: "en-GB",
          localService: true,
          default: true,
        },
      ],
      speak: () => {},
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as unknown as { SpeechSynthesisUtterance: unknown })
      .SpeechSynthesisUtterance = class {
        constructor(public text: string) {}
      };
  });

  it("keeps the old testids and adds the grouped sections", async () => {
    const { container, root } = await mount();

    // Old page.
    expect(q(container, "settings-page")).toBeTruthy();
    expect(q(container, "settings-back")).toBeTruthy();
    expect(q(container, "settings-preview")).toBeTruthy();
    expect(q(container, "settings-preview-current")).toBeTruthy();
    expect(q(container, "settings-reset")).toBeTruthy();
    expect(q(container, "build-id")).toBeTruthy();
    expect(q(container, "setting-main-size")).toBeTruthy();
    expect(q(container, "setting-trail-size")).toBeTruthy();
    expect(q(container, "font-chip-Geist")).toBeTruthy();
    expect(q(container, "hl-chip-0")).toBeTruthy();
    expect(q(container, "main-color")).toBeTruthy();
    expect(q(container, "main-opacity")).toBeTruthy();
    expect(q(container, "trail-color")).toBeTruthy();
    expect(q(container, "trail-opacity")).toBeTruthy();
    expect(q(container, "gemini-key")).toBeTruthy();
    expect(q(container, "openrouter-key")).toBeTruthy();

    // New groups, in the order DESIGN.md asks for.
    const groups = [...container.querySelectorAll("[data-testid^=settings-group-]")].map(
      (el) => el.getAttribute("data-testid"),
    );
    expect(groups).toEqual([
      "settings-group-background",
      "settings-group-reading",
      "settings-group-ambience",
      "settings-group-read-aloud",
      "settings-group-quiz",
      "settings-group-ai",
      "settings-group-reset",
    ]);

    await act(async () => root.unmount());
  });

  it("writes the background settings into the persisted settings", async () => {
    const { container, root } = await mount();

    // Motion belongs to the gradient glow, so it is live while the style
    // is still "gradient".
    await act(async () => {
      q<HTMLButtonElement>(container, "bg-motion").click();
    });
    expect(stored().bgMotion).toBe(false);

    await act(async () => {
      q<HTMLButtonElement>(container, "bg-style-solid").click();
    });
    expect(stored().bgStyle).toBe("solid");

    await act(async () => {
      q<HTMLButtonElement>(container, "bg-mode-single").click();
    });
    expect(stored().bgColourMode).toBe("single");

    await act(async () => {
      q<HTMLButtonElement>(container, "bg-swatch-pink").click();
    });
    expect(stored().bgColor).toBe("#F472B6");

    await act(async () => {
      const slider = q<HTMLElement>(container, "bg-intensity");
      // The slider only moves when it is dragged or a key is pressed —
      // a plain press changes nothing. It is live while the style is the
      // gradient, so the style goes back to it first.
      q<HTMLButtonElement>(container, "bg-style-gradient").click();
    });
    expect(stored().bgStyle).toBe("gradient");

    await act(async () => {
      const slider = q<HTMLElement>(container, "bg-intensity");
      slider.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      );
    });
    expect(stored().bgIntensity).toBe(0);

    await act(async () => {
      const slider = q<HTMLElement>(container, "bg-intensity");
      slider.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      );
    });
    expect(stored().bgIntensity).toBe(100);

    await act(async () => root.unmount());
  });

  it("the preview follows the picked background", async () => {
    const { container, root } = await mount();

    const stage = () =>
      container.querySelector(".set-preview-stage") as HTMLElement;
    // The preview draws the same glow as the real background: the shader
    // on a canvas, or the CSS haze on a device without WebGL.
    const glow = () =>
      stage().querySelector(".ambient-canvas") ??
      stage().querySelector(".ambient-haze");
    expect(glow()).toBeTruthy();
    expect(stage().querySelector(".ambient-glow")).toBeTruthy();

    await act(async () => {
      q<HTMLButtonElement>(container, "bg-style-solid").click();
    });
    // Solid: a flat fill instead of the glow.
    expect(glow()).toBeNull();
    const fill = stage().querySelector("div[style]") as HTMLElement;
    expect(fill.style.background).toContain("#A6E22E");

    await act(async () => {
      q<HTMLButtonElement>(container, "bg-style-off").click();
    });
    expect(glow()).toBeNull();
    expect(stage().querySelector("div[style]")).toBeNull();

    await act(async () => root.unmount());
  });

  it("writes the read-aloud settings into the persisted settings", async () => {
    const { container, root } = await mount();

    // The switch turns the voice on.
    await act(async () => {
      q<HTMLButtonElement>(container, "read-aloud-toggle").click();
    });
    expect(stored().readAloud).toBe(true);

    // The speed slider writes a multiplier (the UI shows a percentage).
    await act(async () => {
      const slider = q<HTMLElement>(container, "read-aloud-rate");
      slider.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      );
    });
    expect(stored().readAloudRate).toBe(1.5);

    await act(async () => root.unmount());
  });

  it("the reset button puts every setting back to the default", async () => {
    const { container, root } = await mount();

    await act(async () => {
      q<HTMLButtonElement>(container, "bg-style-solid").click();
    });
    expect(stored().bgStyle).toBe("solid");

    await act(async () => {
      q<HTMLButtonElement>(container, "settings-reset").click();
    });
    expect(stored().bgStyle).toBe("gradient");
    expect(stored().bgColourMode).toBe("alternate");
    expect(stored().bgColor).toBe("#A6E22E");
    expect(stored().bgMotion).toBe(true);
    expect(stored().bgIntensity).toBe(60);
    expect(stored().readAloud).toBe(false);

    await act(async () => root.unmount());
  });
});
