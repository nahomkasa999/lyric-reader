// Read aloud (v4.7): the speech wrapper's own rules — how a text is split
// into chunks, which voice is picked, and what the engine is allowed to do.
import { describe, it, expect, vi } from "vitest";
import {
  chunkText,
  clampRate,
  pickVoice,
  getVoices,
  loadVoices,
  speak,
  stopSpeech,
  speechSupported,
  type VoiceInfo,
} from "../src/lib/speech";

/** A fake speech engine that records what it was asked to say. */
function fakeEngine() {
  const spoken: { text: string; rate: number; voiceURI?: string }[] = [];
  const listeners: { fn: () => void }[] = [];
  const synth = {
    speaking: false,
    paused: false,
    getVoices: () => [
      {
        voiceURI: "urn:one",
        name: "Ada",
        lang: "en-GB",
        localService: true,
        default: true,
      },
      {
        voiceURI: "urn:two",
        name: "Grace",
        lang: "en-US",
        localService: false,
        default: false,
      },
    ],
    speak: (u: SpeechSynthesisUtterance) => {
      spoken.push({
        text: u.text,
        rate: u.rate,
        voiceURI: (u.voice as SpeechSynthesisVoice | undefined)?.voiceURI,
      });
      // The engine answers on the next tick, like a real one.
      setTimeout(() => u.onend?.(new Event("end")), 0);
    },
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    addEventListener: (_: string, fn: () => void) => listeners.push({ fn }),
    removeEventListener: (_: string, fn: () => void) => {
      const i = listeners.findIndex((l) => l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis =
    synth;
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown })
    .SpeechSynthesisUtterance = class {
      text: string;
      rate = 1;
      pitch = 1;
      voice?: SpeechSynthesisVoice;
      lang = "";
      onend: ((e: Event) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };
  return { spoken, synth };
}

describe("chunkText()", () => {
  it("keeps whole sentences together", () => {
    expect(chunkText("One. Two. Three.")).toEqual([
      "One.",
      "Two.",
      "Three.",
    ]);
  });

  it("drops empty text", () => {
    expect(chunkText("   ")).toEqual([]);
    expect(chunkText("")).toEqual([]);
  });

  it("cuts a very long sentence on word boundaries", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(long, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    expect(chunks.join(" ")).toBe(long);
  });

  it("keeps the punctuation with its sentence", () => {
    expect(chunkText("Wait... what? Now!")).toEqual([
      "Wait...",
      "what?",
      "Now!",
    ]);
  });
});

describe("pickVoice()", () => {
  const voices: VoiceInfo[] = [
    { uri: "urn:one", name: "Ada", lang: "en-GB", local: true },
    { uri: "urn:two", name: "Grace", lang: "en-US", local: false },
  ];

  it("finds the voice the user picked", () => {
    expect(pickVoice(voices, "urn:two")?.name).toBe("Grace");
  });

  it("falls back to the browser default", () => {
    expect(pickVoice(voices, "")).toBeNull();
    expect(pickVoice(voices, null)).toBeNull();
    expect(pickVoice(voices, "urn:missing")).toBeNull();
  });
});

describe("clampRate()", () => {
  it("keeps the rate inside what the engine accepts", () => {
    expect(clampRate(0.1)).toBe(0.5);
    expect(clampRate(9)).toBe(2);
    expect(clampRate(1.25)).toBe(1.25);
    expect(clampRate(Number.NaN)).toBe(1);
  });
});

describe("speak()", () => {
  it("says the text with the voice and the rate the user chose", async () => {
    const { spoken } = fakeEngine();
    expect(speechSupported()).toBe(true);
    await speak("Hello there.", { rate: 1.5, voiceURI: "urn:two" });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("Hello there.");
    expect(spoken[0].rate).toBe(1.5);
    expect(spoken[0].voiceURI).toBe("urn:two");
  });

  it("splits a long text into several utterances", async () => {
    const { spoken } = fakeEngine();
    await speak("One. Two. Three. Four.", { rate: 1, voiceURI: "" });
    expect(spoken.length).toBe(4);
  });

  it("refuses to talk on a device with no speech engine", async () => {
    delete (globalThis as unknown as { speechSynthesis?: unknown })
      .speechSynthesis;
    await expect(speak("Hello.")).rejects.toThrow();
    expect(speechSupported()).toBe(false);
  });

  it("stops the voice on request", () => {
    const { synth } = fakeEngine();
    const cancel = vi.spyOn(synth, "cancel");
    stopSpeech();
    expect(cancel).toHaveBeenCalled();
  });
});

describe("the voice list", () => {
  it("reads the voices the device has", () => {
    fakeEngine();
    const voices = getVoices();
    expect(voices.map((v) => v.name)).toEqual(["Ada", "Grace"]);
    expect(voices[0].local).toBe(true);
  });

  it("resolves with the list when it is already there", async () => {
    fakeEngine();
    const voices = await loadVoices(50);
    expect(voices.length).toBe(2);
  });
});
