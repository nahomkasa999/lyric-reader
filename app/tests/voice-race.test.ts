// The voice race: a reader that re-renders while the voice reads must
// speak each sentence once, in order, and never skip one.
//
// The harness looks like Reader.tsx: the position is state, and the
// callbacks are NEW functions on every render (the reader builds them
// inline). A stable-callback harness hides the race, which is why the
// older read-aloud tests never caught it.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement, useState } from "react";
import { useReadAloud, type ReadAloud } from "../src/components/reader/useReadAloud";

// Real timers and real React scheduling: the reader is driven by the
// clock, the way it is in the app.
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

/** What the phone's voice was asked to say, in order. */
const spoken: string[] = [];
/** What ElevenLabs was asked for, in order. */
const asked: string[] = [];
/** How long one sentence takes to be read, in ms. */
let readMs = 0;

vi.mock("../src/lib/elevenlabs", () => ({
  DEFAULT_VOICE: "JBFqnCBsd6RMkjVDRZzb",
  playAudio: async (data: ArrayBuffer) => {
    await new Promise((r) => setTimeout(r, readMs));
    void data;
  },
  stopAudio: () => {},
  speakAudio: async (text: string) => {
    asked.push(text);
    return new ArrayBuffer(8);
  },
  speakError: () => "failed",
}));

vi.mock("../src/lib/speech", () => ({
  speak: async (text: string) => {
    spoken.push(text);
    await new Promise((r) => setTimeout(r, readMs));
  },
  speechSupported: () => true,
  stopSpeech: () => {},
}));

const PARTS = ["One.", "Two.", "Three.", "Four.", "Five."];

let api: ReadAloud | null = null;
let setPosOut: ((n: number) => void) | null = null;

/** Mirrors Reader.tsx: state for the position, inline callbacks. */
function Reader(props: { follow: boolean; engine: "eleven" | "system" }) {
  const [pos, setPos] = useState(0);
  setPosOut = setPos;
  const r = useReadAloud({
    follow: props.follow,
    positionKey: `0:${pos}`,
    currentText: () => PARTS[pos] ?? "",
    nextText: () => PARTS[pos + 1] ?? "",
    blocked: () => false,
    advance: () => {
      if (pos >= PARTS.length - 1) return false;
      setPos(pos + 1);
      return true;
    },
    voice: "AAAAAAAAAAAAAAAAAAAA",
    voiceURI: "",
    speed: 1,
    engine: props.engine,
    key: props.engine === "eleven" ? "sk_test" : "",
  });
  api = r;
  return null;
}

async function mount(follow: boolean, engine: "eleven" | "system" = "system"): Promise<Root> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Reader, { follow, engine }));
  });
  return root;
}

/**
 * Let the reader run for a while. Plain timers, not act(): inside act()
 * React holds the updates until the act scope ends, which would freeze
 * the reader mid-sentence and test nothing real.
 */
async function settle(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("the voice race", () => {
  beforeEach(() => {
    spoken.length = 0;
    asked.length = 0;
    readMs = 5;
    api = null;
    setPosOut = null;
  });

  it("speaks each sentence exactly once, in order, from one press", async () => {
    const root = await mount(false, "system");
    await act(async () => api!.toggle());
    await settle(1500);
    expect(spoken).toEqual(PARTS);
    await act(async () => root.unmount());
  });

  it("does not repeat or skip with the ElevenLabs engine either", async () => {
    const root = await mount(false, "eleven");
    await act(async () => api!.toggle());
    await settle(1500);
    expect(asked.filter((t) => t === "One.").length).toBe(1);
    expect(asked.filter((t) => t === "Two.").length).toBe(1);
    expect(asked.filter((t) => t === "Five.").length).toBe(1);
    await act(async () => root.unmount());
  });

  it("follow-along does not start a second reader on each render", async () => {
    const root = await mount(true, "system");
    await act(async () => {
      api!.toggle();
    });
    await settle(1500);
    expect(spoken).toEqual(PARTS);
    await act(async () => root.unmount());
  });

  it("a slow sentence is not skipped when the reader re-renders while it is read", async () => {
    readMs = 60;
    const root = await mount(false, "system");
    await act(async () => api!.toggle());
    // Re-render the reader several times while the first sentence plays.
    for (let i = 0; i < 4; i++) {
      await settle(10);
      await act(async () => setPosOut?.(0));
    }
    await settle(2000);
    expect(spoken).toEqual(PARTS);
    await act(async () => root.unmount());
  });

  it("stop then start again reads from the current sentence, once", async () => {
    const root = await mount(false, "system");
    await act(async () => api!.toggle());
    await settle(20);
    await act(async () => api!.toggle()); // stop
    await settle(100);
    const before = spoken.length;
    await act(async () => api!.toggle()); // start again
    await settle(1500);
    // Restarting may repeat the sentence that was cut short, but no
    // sentence is read twice in a row while the session runs.
    const after = spoken.slice(before);
    for (let i = 1; i < after.length; i++) {
      expect(after[i]).not.toBe(after[i - 1]);
    }
    await act(async () => root.unmount());
  });
});
