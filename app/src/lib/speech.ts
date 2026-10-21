// Read aloud (v4.7): the browser's own voices, wrapped in one small module.
//
// Nothing here knows about the reader — it speaks strings and reports back.
// The reader decides WHAT to say; this file only knows HOW to say it.
//
// Three browser quirks are handled here, because they are the difference
// between "the voice works" and "the voice mysteriously stops":
//  1. `getVoices()` is empty on the first call in Chrome — the list only
//     arrives with the `voiceschanged` event.
//  2. Chrome silently stops long utterances after ~15 seconds, so the text
//     is split into short chunks that are queued one after another.
//  3. Chrome can leave the engine "paused" mid-utterance, so a slow
//     `resume()` keeps it awake while something is being spoken.

export interface SpeakOptions {
  /** 0.5 (slow) – 2 (fast) */
  rate: number;
  /** 0 (flat) – 2 (high) */
  pitch: number;
  /** voiceURI of the chosen voice, or "" for the browser default */
  voiceURI: string;
}

export const DEFAULT_SPEAK_OPTIONS: SpeakOptions = {
  rate: 1,
  pitch: 1,
  voiceURI: "",
};

/** A voice, flattened so it can live in settings and be compared by uri. */
export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
  /** true for the voices the phone marks as its own language */
  local: boolean;
}

const MAX_CHUNK = 180;

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  const s = window.speechSynthesis;
  if (!s || typeof s.speak !== "function") return null;
  return s;
}

/** True when this browser/device can speak at all. */
export function speechSupported(): boolean {
  return getSynth() !== null && typeof SpeechSynthesisUtterance !== "undefined";
}

/** The raw voice list the browser knows about right now. */
export function rawVoices(): SpeechSynthesisVoice[] {
  const s = getSynth();
  if (!s) return [];
  try {
    return s.getVoices() ?? [];
  } catch {
    return [];
  }
}

/** The raw voice list, flattened for the UI. */
export function getVoices(): VoiceInfo[] {
  return rawVoices().map((v) => ({
    uri: v.voiceURI,
    name: v.name,
    lang: v.lang,
    local: v.localService,
  }));
}

/**
 * Wait for the voice list. Chrome fills it in later (the `voiceschanged`
 * event); other browsers have it ready straight away.
 */
export function loadVoices(timeoutMs = 2000): Promise<VoiceInfo[]> {
  const s = getSynth();
  if (!s) return Promise.resolve([]);
  const now = getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise<VoiceInfo[]>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      s.removeEventListener?.("voiceschanged", finish);
      resolve(getVoices());
    };
    const timer = window.setTimeout(finish, timeoutMs);
    s.addEventListener?.("voiceschanged", finish);
  });
}

/**
 * Split a text into speakable chunks: sentences first (so the pauses land
 * in the right places), then hard-split anything still too long.
 *
 * The Ethiopic marks (፡ ። ፧) end a sentence too — without them an
 * Amharic paragraph is one chunk, and Chrome cuts it off at 15 seconds.
 */
export function chunkText(text: string, maxChars = MAX_CHUNK): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences =
    clean.match(/[^.!?…፡።፧]+[.!?…፡።፧]+["'”’)]*|[^.!?…፡።፧]+$/g) ?? [clean];
  const out: string[] = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length <= maxChars) {
      out.push(s);
      continue;
    }
    // Too long for one breath: cut on word boundaries.
    let rest = s;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(" ", maxChars);
      if (cut < maxChars * 0.4) cut = maxChars;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out.filter(Boolean);
}

/** Find the voice the user picked; null means "the browser default". */
export function pickVoice(
  voices: VoiceInfo[],
  uri: string | null | undefined,
): VoiceInfo | null {
  if (!uri) return null;
  return voices.find((v) => v.uri === uri) ?? null;
}

/** Clamp a rate/pitch into the range the engine accepts. */
export function clampRate(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(2, Math.max(0.5, v));
}
export function clampPitch(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(2, Math.max(0, v));
}

// Generation counter: a stale utterance callback (from a speech we already
// cancelled) must never resolve the promise of the next one.
let generation = 0;
let keepalive: number | null = null;

function stopKeepalive(): void {
  if (keepalive !== null) {
    window.clearInterval(keepalive);
    keepalive = null;
  }
}

function startKeepalive(): void {
  stopKeepalive();
  const s = getSynth();
  if (!s) return;
  keepalive = window.setInterval(() => {
    // Chrome's engine can fall asleep mid-utterance; resume() wakes it.
    try {
      if (s.speaking && !s.paused) s.resume();
    } catch {
      /* ignore */
    }
  }, 8000);
}

/** True while the engine is actually saying something. */
export function speechActive(): boolean {
  const s = getSynth();
  if (!s) return false;
  try {
    return s.speaking;
  } catch {
    return false;
  }
}

/** Stop whatever is being said, right now. */
export function stopSpeech(): void {
  generation += 1;
  stopKeepalive();
  const s = getSynth();
  if (!s) return;
  try {
    s.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * Speak a text. Resolves when the last chunk ends (or fails — a failure is
 * not worth an exception in the reader). Rejects only when the device has
 * no speech engine at all.
 */
export function speak(
  text: string,
  options: Partial<SpeakOptions> = {},
): Promise<void> {
  const s = getSynth();
  if (!s || typeof SpeechSynthesisUtterance === "undefined") {
    return Promise.reject(new Error("speech-unsupported"));
  }
  const opts = { ...DEFAULT_SPEAK_OPTIONS, ...options };
  const chunks = chunkText(text);
  if (!chunks.length) return Promise.resolve();

  stopSpeech();
  const gen = ++generation;
  const voices = getVoices();
  const chosen = pickVoice(voices, opts.voiceURI);

  return new Promise<void>((resolve) => {
    let left = chunks.length;
    const done = () => {
      left -= 1;
      if (left <= 0 && gen === generation) {
        stopKeepalive();
        resolve();
      }
    };
    for (const chunk of chunks) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = clampRate(opts.rate);
      u.pitch = clampPitch(opts.pitch);
      if (chosen) {
        const raw = rawVoices().find((v) => v.voiceURI === chosen.uri);
        if (raw) {
          u.voice = raw;
          u.lang = raw.lang;
        }
      }
      u.onend = done;
      u.onerror = done;
      try {
        s.speak(u);
      } catch {
        done();
      }
    }
    startKeepalive();
  });
}
