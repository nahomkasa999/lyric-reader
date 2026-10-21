// The HD voice engine (v4.8): the voice list, and the rules around
// asking the phone what it can do.
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_VOICE,
  KOKORO_VOICES,
  kokoroInstalled,
  kokoroSupported,
  removeKokoro,
  webgpuAvailable,
} from "../src/lib/kokoro";

describe("the Kokoro voice list", () => {
  it("has every voice the engine ships with", () => {
    expect(KOKORO_VOICES.length).toBe(28);
    const ids = KOKORO_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_VOICE);
  });

  it("names every voice, with a language and a grade", () => {
    for (const v of KOKORO_VOICES) {
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.lang).toMatch(/^en-(us|gb)$/);
      expect(["Female", "Male"]).toContain(v.gender);
      expect(v.grade.length).toBeGreaterThan(0);
    }
  });

  it("starts on a voice that exists", () => {
    expect(KOKORO_VOICES.some((v) => v.id === DEFAULT_VOICE)).toBe(true);
  });
});

describe("what the phone can do", () => {
  beforeEach(() => {
    // No cache, no GPU: the plain fallback path.
    (globalThis as unknown as { caches?: unknown }).caches = undefined;
  });

  it("says the engine can run when the browser has WebAssembly", () => {
    expect(kokoroSupported()).toBe(typeof WebAssembly === "object");
  });

  it("does not claim a GPU it cannot use", async () => {
    expect(await webgpuAvailable()).toBe(false);
  });

  it("does not think the engine is installed when there is no cache", async () => {
    expect(await kokoroInstalled()).toBe(false);
  });

  it("survives a phone with no cache at all", async () => {
    await expect(removeKokoro()).resolves.toBeUndefined();
  });
});
