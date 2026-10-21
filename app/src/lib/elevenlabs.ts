// ElevenLabs — the voice, in the cloud.
//
// The phone asks ElevenLabs for the audio, so it never runs a model
// itself: no WebGPU, no 86 MB download, no battery drain on a budget
// phone.
//
// The key is the USER'S OWN: they paste it in Settings and it stays on
// their phone only, and it is sent to api.elevenlabs.io and nowhere
// else. There is no shared key baked into the build — every reader
// brings their own, and their quota is their own.
//
// Without a key the app falls back to the browser's own speech engine
// (lib/speech.ts) — rougher, but it always works.
import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { STANDARD_VOICES } from "./elevenlabsVoices";
import { playAudio, stopAudio } from "./audio";

const KEY = "lr-elevenlabs-key";

/**
 * The model that reads: steady on long text, and it takes a speed.
 * `eleven_multilingual_v2` is the only generation that accepts the
 * `speed` voice setting — the app's speed slider depends on it.
 */
export const ELEVEN_MODEL = "eleven_multilingual_v2";

/**
 * The model for the languages v2 does not know (29 of them — Amharic
 * is not one): `eleven_v4` speaks 90+ languages and takes
 * `language_code`, but it has no `speed` setting, so the slider does
 * not apply there.
 */
export const ELEVEN_MODEL_V4 = "eleven_v4";

/** Amharic (and the rest of the Ethiopic script) needs the v4 model. */
const ETHIOPIC_RE = /[\u1200-\u137F\u1380-\u139F]/;

/** Where the user gets a key. */
export const ELEVEN_KEYS_URL = "https://elevenlabs.io/app/settings/api-keys";

/** George — a calm male narrator, and ElevenLabs' most used voice. */
export const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";

export { STANDARD_VOICES };
export { playAudio, stopAudio };

/** The name of a standard voice, if we know it by id. */
export function standardVoiceName(id: string): string {
  return STANDARD_VOICES.find((v) => v.id === id)?.name ?? "";
}

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

/**
 * The key that is used: the reader's own, pasted in Settings.
 *
 * There is no shared key in the build — every reader brings their own,
 * and their quota is their own.
 */
export function hasElevenLabsKey(): boolean {
  return getElevenLabsKey().length > 0;
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

/**
 * Does the key work? A key can be made without the "voices_read"
 * permission: it still speaks, it just cannot list the account's voices.
 * That is a pass with a note, not a failure.
 */
export async function testKey(
  key: string,
): Promise<{ ok: boolean; reason?: string; voices?: number }> {
  if (!key) return { ok: false, reason: "No key yet." };
  try {
    const voices = await listVoices(key);
    return { ok: true, voices: voices.length };
  } catch (e) {
    const err = elevenError(e);
    if (err.missing === "voices_read") {
      return {
        ok: true,
        reason:
          "The key speaks, but the Voices permission is off — it cannot read your voice list. The standard voices will be used.",
      };
    }
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
  // Amharic is read by the v4 model (it knows the language); the speed
  // setting belongs to the v2 model, so it is left out there.
  const amharic = ETHIOPIC_RE.test(text);
  const stream = await (await client(key)).textToSpeech.convert(voiceId, {
    text,
    modelId: amharic ? ELEVEN_MODEL_V4 : ELEVEN_MODEL,
    outputFormat: "mp3_44100_128",
    ...(amharic
      ? { languageCode: "am" }
      : { voiceSettings: { speed: Math.min(1.5, Math.max(0.7, speed)) } }),
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

export interface ElevenError {
  status?: number;
  /** what the API said, in its own words */
  message: string;
  /** the permission the key is missing, when it is a permission problem */
  missing?: string;
}

/** Read the API's own error: its message says what the key may not do. */
export function elevenError(e: unknown): ElevenError {
  const anyE = e as {
    statusCode?: number;
    status?: number;
    message?: string;
    body?: unknown;
  };
  const body = anyE?.body as
    | { detail?: { message?: string; status?: string } }
    | undefined;
  const message =
    body?.detail?.message ?? anyE?.message ?? "Something went wrong.";
  const missing = /missing the permission ([a-z_]+)/.exec(message)?.[1];
  return {
    status: anyE?.statusCode ?? anyE?.status,
    message,
    missing,
  };
}

/** What ElevenLabs says went wrong, in a sentence a person can act on. */
export function errorText(e: unknown, fallback = "Something went wrong."): string {
  const err = elevenError(e);
  if (err.missing) {
    return `This key is missing the ${err.missing} permission.`;
  }
  if (err.status === 401) return "That key was not accepted.";
  if (err.status === 429) return "Too many requests — the key's quota is used up.";
  if (err.status === 422) return "ElevenLabs did not like that request.";
  return err.message || fallback;
}

/**
 * The same words, but for the reader: it says what went wrong AND that
 * the phone's own voice is reading instead — the user must never wonder
 * why the voice they picked is not the voice they hear.
 */
export function speakError(e: unknown): string {
  const err = elevenError(e);
  const why = errorText(e, "ElevenLabs could not read that.");
  if (err.status === 401) {
    return "ElevenLabs did not accept the key — the phone's voice is reading instead.";
  }
  if (err.status === 429) {
    return "The ElevenLabs quota is used up — the phone's voice is reading instead.";
  }
  if (err.missing) {
    return `The key is missing the ${err.missing} permission — the phone's voice is reading instead.`;
  }
  return `${why} The phone's voice is reading instead.`;
}
