// The ElevenLabs key must reach the code that needs it (v4.10).
//
// "key" is a RESERVED React prop: React uses it for reconciliation and
// never passes it to the component. The voice sheet was rendered with
// `key={…}`, so inside it the key was always `undefined` — the account's
// voices were never listed and every preview fell back to the phone.
//
// And a phone voice name ("English (United States)") stored as the
// ElevenLabs voice id is what makes the API answer "An invalid ID has
// been received" — the app must not send it.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import { isVoiceId } from "../src/lib/elevenlabsVoices";
import { load, DEFAULT_SETTINGS } from "../src/lib/settings";
import VoiceSheet from "../src/components/reader/VoiceSheet";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("isVoiceId", () => {
  it("accepts an ElevenLabs id", () => {
    expect(isVoiceId("JBFqnCBsd6RMkjVDRZzb")).toBe(true);
    expect(isVoiceId("hpp4J3VqNfWAUOO0d1Us")).toBe(true);
  });

  it("rejects a phone voice name", () => {
    expect(isVoiceId("English (United States)")).toBe(false);
    expect(isVoiceId("Microsoft Zira Desktop - English (United States)")).toBe(
      false,
    );
    expect(isVoiceId("urn:voice")).toBe(false);
    expect(isVoiceId("")).toBe(false);
  });
});

describe("a stale voice setting", () => {
  beforeEach(() => localStorage.clear());

  it("is dropped, and the default voice reads instead", () => {
    localStorage.setItem(
      "lyric-reader.settings-v1",
      JSON.stringify({ readAloudVoice: "English (United States)" }),
    );
    const s = load();
    expect(s.readAloudVoice).toBe(DEFAULT_SETTINGS.readAloudVoice);
  });

  it("keeps a real voice id", () => {
    localStorage.setItem(
      "lyric-reader.settings-v1",
      JSON.stringify({ readAloudVoice: "CwhRBWXzGAHq8TQ4Fs17" }),
    );
    expect(load().readAloudVoice).toBe("CwhRBWXzGAHq8TQ4Fs17");
  });
});

describe("the voice sheet", () => {
  beforeEach(() => {
    localStorage.clear();
    // A phone with two voices.
    (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = {
      getVoices: () => [
        { voiceURI: "urn:one", name: "Ada", lang: "en-GB", localService: true },
        { voiceURI: "urn:two", name: "Grace", lang: "en-US", localService: true },
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

  async function mount(props: Record<string, unknown>) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(VoiceSheet as never, props));
    });
    return { container, root };
  }

  it(
    "receives the key under a name React does not reserve",
    async () => {
      const seen: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: unknown) => {
          const url =
            typeof input === "string"
              ? input
              : ((input as { url?: string })?.url ?? String(input));
          seen.push(url);
          return new Response(
            JSON.stringify({
              voices: [
                { voice_id: "abc", name: "Rachel", category: "premade" },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }),
      );
      const { container, root } = await mount({
        onClose: () => {},
        voice: "JBFqnCBsd6RMkjVDRZzb",
        onVoiceChange: () => {},
        systemVoice: "",
        onSystemVoiceChange: () => {},
        speed: 1,
        onSpeedChange: () => {},
        engine: "eleven",
        onEngineChange: () => {},
        apiKey: "sk_test",
      });
      // The account's voice list is fetched — the key arrived. (The SDK
      // is loaded on demand, so this can take a moment.)
      const deadline = Date.now() + 25000;
      while (!seen.length && Date.now() < deadline) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 100));
        });
      }
      expect(seen.some((u) => u.includes("/voices"))).toBe(true);
      // ...and the sheet shows the account's voice, not the phone's.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(container.querySelector(".voice-name")?.textContent).toBe("Rachel");
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    },
    30000,
  );
});
