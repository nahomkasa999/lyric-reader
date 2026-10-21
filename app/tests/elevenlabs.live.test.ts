// ElevenLabs, against the real API (v4.9).
//
// These tests talk to api.elevenlabs.io with a real key, so they are
// skipped unless one is given:
//
//   ELEVENLABS_API_KEY=sk_… npx vitest run tests/elevenlabs.live.test.ts
//
// The key is read from the environment and never written to disk. It is
// the same key the app itself uses (ELEVENLABS_API_KEY in .env.local).
import { describe, it, expect } from "vitest";
import { listVoices, speakAudio, DEFAULT_VOICE } from "../src/lib/elevenlabs";

const KEY = (process.env.ELEVENLABS_API_KEY ?? "").trim();
// The live tests cost quota and need the network — they only run when
// they are asked for.
const live = KEY ? describe : describe.skip;

live("the real ElevenLabs", () => {
  it("lists the account's voices", async () => {
    const voices = await listVoices(KEY);
    expect(voices.length).toBeGreaterThan(0);
    // Every voice has an id and a name — the picker needs both.
    for (const v of voices) {
      expect(v.id.length).toBeGreaterThan(5);
      expect(v.name.length).toBeGreaterThan(0);
    }
    // The list is sorted by name, so it reads like a list.
    const names = voices.map((v) => v.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it("reads a sentence with the voice that was picked", async () => {
    const voices = await listVoices(KEY);
    // Not the default voice — the whole point is that the pick is used.
    const other = voices.find((v) => v.id !== DEFAULT_VOICE) ?? voices[0];
    const data = await speakAudio("The page reads itself.", other.id, KEY, 1);
    expect(data.byteLength).toBeGreaterThan(1000);
  });

  it("reads with the default voice too", async () => {
    const data = await speakAudio("The page reads itself.", DEFAULT_VOICE, KEY, 1);
    expect(data.byteLength).toBeGreaterThan(1000);
  });
});
