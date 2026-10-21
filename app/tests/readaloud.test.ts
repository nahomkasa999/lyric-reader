// The read-aloud session (v4.9): the voice the user picked is the voice
// that reads, the phone's own voice can be picked too, and a failure is
// reported instead of silently swapping engines behind the user's back.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import {
  useReadAloud,
  type ReadAloud,
} from "../src/components/reader/useReadAloud";
import { DEFAULT_VOICE } from "../src/lib/elevenlabs";
import { isNetworkError, isOnline } from "../src/lib/online";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** The phone's connection — a fake, so the test can take it away. */
function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

/** What ElevenLabs was asked to say, and with which voice. */
const asked: { text: string; voice: string; speed: number }[] = [];
/** What the phone's own engine was asked to say. */
const spoken: { text: string; voiceURI: string; rate: number }[] = [];
/** Set to make ElevenLabs fail. */
let failWith: unknown = null;

vi.mock("../src/lib/elevenlabs", () => ({
  DEFAULT_VOICE: "JBFqnCBsd6RMkjVDRZzb",
  playAudio: async () => {},
  stopAudio: () => {},
  speakAudio: async (
    text: string,
    voice: string,
    _key: string,
    speed: number,
  ) => {
    asked.push({ text, voice, speed });
    if (failWith) throw failWith;
    return new ArrayBuffer(8);
  },
  speakError: () => "ElevenLabs could not read that — the phone's voice is reading instead.",
}));

vi.mock("../src/lib/speech", () => ({
  speak: async (
    text: string,
    opts: { rate: number; voiceURI: string },
  ) => {
    spoken.push({ text, voiceURI: opts.voiceURI, rate: opts.rate });
  },
  speechSupported: () => true,
  stopSpeech: () => {},
}));

interface Props {
  voice?: string;
  voiceURI?: string;
  engine?: "eleven" | "system";
  /** not "key" — that is a reserved React prop */
  apiKey?: string;
  follow?: boolean;
}

let api: ReadAloud | null = null;

// Stable callbacks — the reader passes stable ones too, and a callback
// that changes on every render would re-arm the reading for ever.
const currentText = () => "Hello there.";
const nextText = () => "And then this.";
const blocked = () => false;
const advance = () => false;

function Harness(props: Props) {
  const r = useReadAloud({
    follow: props.follow ?? false,
    positionKey: "0:0",
    currentText,
    nextText,
    blocked,
    advance,
    voice: props.voice ?? "AAAAAAAAAAAAAAAAAAAA",
    voiceURI: props.voiceURI ?? "",
    speed: 1,
    engine: props.engine ?? "eleven",
    key: props.apiKey ?? "sk_test",
  });
  api = r;
  return null;
}

async function mount(props: Props = {}): Promise<{
  container: HTMLElement;
  root: Root;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Harness, props));
  });
  return { container, root };
}

/** The request for one text (the next sentence is fetched ahead). */
const request = (text: string) => asked.find((a) => a.text === text);

describe("the read-aloud session", () => {
  beforeEach(() => {
    asked.length = 0;
    spoken.length = 0;
    failWith = null;
    api = null;
    setOnline(true);
  });

  it("reads with the voice that was picked", async () => {
    const { root } = await mount({ voice: "BBBBBBBBBBBBBBBBBBBB" });
    await act(async () => {
      api!.toggle();
    });
    expect(request("Hello there.")?.voice).toBe("BBBBBBBBBBBBBBBBBBBB");
    // The phone's voice did not take part.
    expect(spoken.length).toBe(0);
    await act(async () => root.unmount());
  });

  it("fetches the next sentence ahead, with the same voice", async () => {
    const { root } = await mount({ voice: "BBBBBBBBBBBBBBBBBBBB" });
    await act(async () => {
      api!.toggle();
    });
    expect(request("And then this.")?.voice).toBe("BBBBBBBBBBBBBBBBBBBB");
    await act(async () => root.unmount());
  });

  it("does not serve the old voice's audio after a voice change", async () => {
    const { container, root } = await mount({ voice: "AAAAAAAAAAAAAAAAAAAA", follow: true });
    expect(request("Hello there.")?.voice).toBe("AAAAAAAAAAAAAAAAAAAA");

    // The user picks another voice.
    await act(async () => {
      root.render(createElement(Harness, { voice: "BBBBBBBBBBBBBBBBBBBB", follow: true }));
    });
    // The sentence is asked for again — with the new voice.
    const fresh = asked.filter((a) => a.text === "Hello there.");
    expect(fresh.map((a) => a.voice)).toEqual(["AAAAAAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBBBBBB"]);
    await act(async () => root.unmount());
    container.remove();
  });

  it("the phone's own voice is the one that reads", async () => {
    const { root } = await mount({
      engine: "system",
      voiceURI: "urn:two",
    });
    await act(async () => {
      api!.toggle();
    });
    expect(asked.length).toBe(0);
    expect(spoken[0]?.voiceURI).toBe("urn:two");
    await act(async () => root.unmount());
  });

  it("says so when ElevenLabs cannot read, and the phone reads instead", async () => {
    failWith = { status: 429, message: "quota" };
    const { root } = await mount({ voice: "AAAAAAAAAAAAAAAAAAAA" });
    await act(async () => {
      api!.toggle();
    });
    expect(api!.error).toContain("phone's voice");
    expect(spoken.length).toBe(1);
    await act(async () => root.unmount());
  });

  it("explains the missing key instead of just reading differently", async () => {
    const { root } = await mount({ apiKey: "" });
    await act(async () => {
      api!.toggle();
    });
    expect(asked.length).toBe(0);
    expect(spoken.length).toBe(1);
    expect(api!.error).toContain("No ElevenLabs key");
    await act(async () => root.unmount());
  });

  it("knows which engine is really reading", async () => {
    const { root } = await mount({ apiKey: "sk_test" });
    expect(api!.actual).toBe("eleven");
    await act(async () => root.unmount());

    const second = await mount({ apiKey: "" });
    expect(api!.actual).toBe("system");
    await act(async () => second.root.unmount());
  });

  it("never sends a phone voice name to ElevenLabs", async () => {
    // A stale setting can hold "English (United States)" — ElevenLabs
    // answers "An invalid ID has been received" for that.
    const { root } = await mount({ voice: "English (United States)" });
    await act(async () => {
      api!.toggle();
    });
    expect(request("Hello there.")?.voice).toBe(DEFAULT_VOICE);
    expect(api!.error).toContain("default voice");
    await act(async () => root.unmount());
  });
});

describe("the phone is offline", () => {
  beforeEach(() => {
    asked.length = 0;
    spoken.length = 0;
    failWith = null;
    api = null;
  });

  it("knows a network failure from a server's answer", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("network error"))).toBe(true);
    expect(isNetworkError(new Error("quota exceeded"))).toBe(false);
  });

  it("knows whether the phone is online", () => {
    setOnline(false);
    expect(isOnline()).toBe(false);
    setOnline(true);
    expect(isOnline()).toBe(true);
  });

  it("reads with the phone's voice and says so once", async () => {
    failWith = new TypeError("Failed to fetch");
    setOnline(false);
    const { root } = await mount({ apiKey: "sk_test" });
    await act(async () => {
      api!.toggle();
    });
    expect(api!.error).toContain("You're offline");
    expect(api!.actual).toBe("system");
    // The phone's own voice took over.
    expect(spoken.length).toBe(1);
    const first = asked.length;

    // The next sentence does not try the network again, and the reader
    // is not told again.
    await act(async () => {
      api!.resume();
    });
    expect(asked.length).toBe(first);
    expect(api!.error).toContain("You're offline");
    await act(async () => root.unmount());
  });

  it("goes back to ElevenLabs when the connection returns", async () => {
    failWith = new TypeError("Failed to fetch");
    setOnline(false);
    const { root } = await mount({ apiKey: "sk_test" });
    await act(async () => {
      api!.toggle();
    });
    expect(api!.actual).toBe("system");

    setOnline(true);
    failWith = null;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(api!.error).toContain("Back online");
    expect(api!.actual).toBe("eleven");
    await act(async () => root.unmount());
  });
});
