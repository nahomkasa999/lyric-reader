// ElevenLabs (v4.9): the key lives on the phone, the voice comes from
// the cloud, and the phone's own voice is the fallback.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_VOICE,
  ELEVEN_KEYS_URL,
  getEffectiveElevenLabsKey,
  getElevenLabsKey,
  listVoices,
  removeElevenLabsKey,
  setElevenLabsKey,
  testKey,
} from "../src/lib/elevenlabs";

describe("the ElevenLabs key", () => {
  beforeEach(() => {
    localStorage.clear();
    removeElevenLabsKey();
  });

  it("lives on this phone only", () => {
    expect(getElevenLabsKey()).toBe("");
    setElevenLabsKey("  sk_test_123  ");
    expect(getElevenLabsKey()).toBe("sk_test_123");
    expect(
      localStorage.getItem("lr-elevenlabs-key"),
    ).toBe("sk_test_123");
    removeElevenLabsKey();
    expect(getElevenLabsKey()).toBe("");
  });

  it("is the key that gets used", () => {
    setElevenLabsKey("sk_mine");
    expect(getEffectiveElevenLabsKey()).toBe("sk_mine");
  });

  it("points at the place a key comes from", () => {
    expect(ELEVEN_KEYS_URL).toContain("elevenlabs.io");
  });
});

describe("without a key", () => {
  beforeEach(() => {
    localStorage.clear();
    removeElevenLabsKey();
  });

  it("has no voices to show", async () => {
    expect(await listVoices("")).toEqual([]);
  });

  it("says so instead of pretending", async () => {
    const r = await testKey("");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("No key yet.");
  });
});

describe("with a key", () => {
  beforeEach(() => {
    localStorage.clear();
    setElevenLabsKey("sk_test_123");
    // The SDK talks to the network — answer it here.
    const body = {
      voices: [
        {
          voice_id: "abc",
          name: "Rachel",
          category: "premade",
          labels: { accent: "American", gender: "female" },
        },
        {
          voice_id: "def",
          name: "A Clone",
          category: "cloned",
          description: "my own voice",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
  });

  it("lists the account's voices", async () => {
    const voices = await listVoices("sk_test_123");
    // Sorted by name, so the list reads like a list.
    expect(voices.map((v) => v.name)).toEqual(["A Clone", "Rachel"]);
    expect(voices[1].id).toBe("abc");
    expect(voices[1].accent).toBe("American");
    expect(voices[0].category).toBe("cloned");
  });

  it("checks the key and counts the voices", async () => {
    const r = await testKey("sk_test_123");
    expect(r.ok).toBe(true);
    expect(r.voices).toBe(2);
  });

  it("has a default voice to fall back on", () => {
    expect(DEFAULT_VOICE.length).toBeGreaterThan(10);
  });
});
