// Which model reads the text (v4.10).
//
// `eleven_multilingual_v2` is the only generation that takes the `speed`
// setting — the app's speed slider depends on it — but it knows 29
// languages, and Amharic is not one of them. `eleven_v4` speaks 90+
// languages (and takes `language_code`), but it has no `speed`.
import { describe, it, expect, beforeEach, vi } from "vitest";

const requests: Record<string, unknown>[] = [];

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    textToSpeech = {
      convert: async (_voice: string, request: Record<string, unknown>) => {
        requests.push(request);
        return new Response(new ArrayBuffer(8)).body as ReadableStream;
      },
    };
    voices = { getAll: async () => ({ voices: [] }) };
  },
}));

import { speakAudio, ELEVEN_MODEL, ELEVEN_MODEL_V4 } from "../src/lib/elevenlabs";

describe("the model that reads", () => {
  beforeEach(() => {
    requests.length = 0;
  });

  it("reads English with the model that takes a speed", async () => {
    await speakAudio("Hello there.", "JBFqnCBsd6RMkjVDRZzb", "sk_x", 1.2);
    expect(requests[0].modelId).toBe(ELEVEN_MODEL);
    expect(requests[0].voiceSettings).toEqual({ speed: 1.2 });
  });

  it("reads Amharic with the model that knows the language", async () => {
    await speakAudio("እንድና ይህ ነው።", "JBFqnCBsd6RMkjVDRZzb", "sk_x", 1.2);
    expect(requests[0].modelId).toBe(ELEVEN_MODEL_V4);
    expect(requests[0].languageCode).toBe("am");
    // v4 has no speed setting — asking for one is asking for trouble.
    expect(requests[0].voiceSettings).toBeUndefined();
  });

  it("keeps the speed inside the range the API accepts", async () => {
    await speakAudio("Hi.", "JBFqnCBsd6RMkjVDRZzb", "sk_x", 9);
    expect((requests[0].voiceSettings as { speed: number }).speed).toBe(1.5);
    await speakAudio("Hi.", "JBFqnCBsd6RMkjVDRZzb", "sk_x", 0.1);
    expect((requests[1].voiceSettings as { speed: number }).speed).toBe(0.7);
  });
});
