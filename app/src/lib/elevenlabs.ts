// ElevenLabs — the voice, in the cloud.
//
// The phone asks ElevenLabs for the audio, so it never runs a model
// itself: no WebGPU, no 86 MB download, no battery drain on a budget
// phone. Two kinds of key:
//
//  · the app's own key (VITE_ELEVENLABS_API_KEY, baked at build time) —
//    the app works out of the box, on the app's shared quota
//  · the user's own key, pasted in Settings — stored on their phone
//    only, and used for their own quota
//
// Either way the key is sent to api.elevenlabs.io and nowhere else.
// Without a key the app falls back to the browser's own speech engine
// (lib/speech.ts) — rougher, but it always works.
import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const KEY = "lr-elevenlabs-key";

/** The model that reads: steady on long text, and it takes a speed. */
export const ELEVEN_MODEL = "eleven_multilingual_v2";

/** Where the user gets a key. */
export const ELEVEN_KEYS_URL = "https://elevenlabs.io/app/settings/api-keys";

/** George — a calm male narrator, and ElevenLabs' most used voice. */
export const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";

export function getElevenLabsKey(): string {
  try {
    return (localStorage.getItem(KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function setElevenLabsKey(k: string): void {
  try {
    localStorage.setItem(KEY, k.trim());
  } catch {
    /* private mode: the key just won't persist */
  }
}

export function removeElevenLabsKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The app-level key, baked into the build (like VITE_GEMINI_API_KEY). */
export function getEnvElevenLabsKey(): string {
  try {
    return ((import.meta.env?.VITE_ELEVENLABS_API_KEY ?? "") as string).trim();
  } catch {
    return "";
  }
}

/** The key actually used: the user's own wins over the app's. */
export function getEffectiveElevenLabsKey(): string {
  return getElevenLabsKey() || getEnvElevenLabsKey();
}

export function hasElevenLabsKey(): boolean {
  return getEffectiveElevenLabsKey().length > 0;
}

/**
 * The SDK is 4.6 MB of JavaScript — too much to put in every phone's
 * install. It is loaded the first time somebody actually uses the voice,
 * and then the browser keeps it.
 */
let sdk: Promise<typeof import("@elevenlabs/elevenlabs-js")> | null = null;

function loadSdk(): Promise<typeof import("@elevenlabs/elevenlabs-js")> {
  sdk ??= import("@elevenlabs/elevenlabs-js");
  return sdk;
}

/** The SDK reads the key from the environment; we always pass it. */
async function client(key: string): Promise<ElevenLabsClient> {
  const { ElevenLabsClient } = await loadSdk();
  return new ElevenLabsClient({ apiKey: key });
}

export interface ElevenVoice {
  id: string;
  name: string;
  /** "premade" | "cloned" | "professional" | "generated" */
  category: string;
  /** "American" | "British" … */
  accent?: string;
  gender?: string;
  /** the one line that says what the voice is for */
  description?: string;
}

/** The voices this key can use — the library plus anything they cloned. */
export async function listVoices(key: string): Promise<ElevenVoice[]> {
  if (!key) return [];
  const res = await (await client(key)).voices.getAll();
  return (res.voices ?? [])
    .map((v) => ({
      id: v.voiceId,
      name: v.name ?? "Voice",
      category: v.category ?? "premade",
      accent: v.labels?.accent,
      gender: v.labels?.gender,
      description: v.description ?? v.labels?.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Does the key work? */
export async function testKey(
  key: string,
): Promise<{ ok: boolean; reason?: string; voices?: number }> {
  if (!key) return { ok: false, reason: "No key yet." };
  try {
    const voices = await listVoices(key);
    return { ok: true, voices: voices.length };
  } catch (e) {
    return { ok: false, reason: errorText(e, "Could not reach ElevenLabs.") };
  }
}

/** Turn a text into audio (mp3). */
export async function speakAudio(
  text: string,
  voiceId: string,
  key: string,
  speed = 1,
): Promise<ArrayBuffer> {
  if (!key) throw new Error("No ElevenLabs key yet.");
  const stream = await (await client(key)).textToSpeech.convert(voiceId, {
    text,
    modelId: ELEVEN_MODEL,
    outputFormat: "mp3_44100_128",
    voiceSettings: { speed: Math.min(1.5, Math.max(0.7, speed)) },
  });
  // The SDK hands back a web stream — collect it into one buffer.
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      size += value.length;
    }
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out.buffer;
}

/** What ElevenLabs says went wrong, when it bothers to say it. */
function errorText(e: unknown, fallback: string): string {
  const anyE = e as { status?: number; message?: string; body?: unknown };
  const status = anyE?.status;
  if (status === 401) return "That key was not accepted.";
  if (status === 429) return "Too many requests — the key's quota is used up.";
  if (status === 422) return "ElevenLabs did not like that request.";
  return anyE?.message || fallback;
}

// --- playback -------------------------------------------------------------
// One AudioContext for the whole app, unlocked by the first tap (phones
// only let audio start from a user gesture).

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** Stop whatever is being read. */
export function stopAudio(): void {
  if (current) {
    try {
      current.stop();
    } catch {
      /* already stopped */
    }
    current = null;
  }
}

/** Play an mp3 buffer; resolves when the sound ends. */
export async function playAudio(data: ArrayBuffer): Promise<void> {
  const ac = audioContext();
  if (ac.state === "suspended") await ac.resume();
  const buffer = await ac.decodeAudioData(data);
  stopAudio();
  return new Promise<void>((resolve) => {
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(ac.destination);
    src.onended = () => {
      if (current === src) current = null;
      resolve();
    };
    current = src;
    src.start();
  });
}
