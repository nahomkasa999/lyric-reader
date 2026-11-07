// Read aloud (v4.9): the voice, and the reading session.
//
// The speaker button in the reader is a play/pause, exactly like the
// auto-scroll button: tap it and the book reads itself, sentence by
// sentence, the page turning as it goes. Tap it again and it stops.
//
// The voice comes from ElevenLabs (lib/elevenlabs.ts) — the phone only
// downloads the sound, so nothing heavy runs on it. Without a key (or
// with the phone's voice chosen) the browser's own speech engine takes
// over, which always works.
//
// While one sentence is being read, the next one is already on its way
// from the network, so the reading never stutters.
//
// Overlays (the action popup, a selection, the meaning card, the Ask
// sheet) hold the voice until they close.
//
// How the sentences are kept in order (the voice race, fixed):
//   · The reader re-renders and passes NEW callbacks every time. The
//     hook reads them from `latest`, so its own callbacks never change
//     identity — nothing re-fires just because the page re-rendered.
//   · A sentence is started once per position (`startedKey`). A
//     re-render, a second tap or a resume for the same position is a
//     no-op while that sentence is still being read.
//   · Every reading carries a token. Only the reading that still holds
//     the token may turn the page — a superseded or stopped reading
//     never moves the reader on.
//   · Cancelling the phone's speech or an audio clip settles its promise,
//     so a cancelled reading always ends instead of hanging.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_VOICE,
  playAudio,
  speakAudio,
  speakError,
  stopAudio,
} from "../../lib/elevenlabs";
import { isVoiceId } from "../../lib/elevenlabsVoices";
import {
  speak as speakSystem,
  speechSupported,
  stopSpeech,
} from "../../lib/speech";
import { isNetworkError, isOnline } from "../../lib/online";
import { useOnline } from "./useOnline";

export interface ReadAloudOptions {
  /** follow-along: speak every sentence the reader moves to */
  follow: boolean;
  /** changes whenever the reader moves — a new sentence */
  positionKey: string;
  /** the text on screen right now */
  currentText: () => string;
  /** the sentence after this one — fetched while this one is read */
  nextText: () => string;
  /** true while an overlay owns the screen */
  blocked: () => boolean;
  /** move to the next sentence; false at the end of the book */
  advance: () => boolean;
  /** the ElevenLabs voice id */
  voice: string;
  /** the phone's own voice (voiceURI); "" = the phone's default */
  voiceURI: string;
  /** speaking speed, 0.7 – 1.5 */
  speed: number;
  /** which engine reads */
  engine: "eleven" | "system";
  /** the ElevenLabs key (empty = no ElevenLabs) */
  key: string;
}

export interface ReadAloud {
  /** the voice is talking right now */
  speaking: boolean;
  /** the reading session runs */
  session: boolean;
  /** this device can speak at all */
  supported: boolean;
  /** the engine that is really reading right now */
  actual: "eleven" | "system";
  /** why the other engine is reading, when it is */
  error: string | null;
  /** put the note away */
  clearError: () => void;
  /** start or stop the reading session */
  toggle: () => void;
  /** stop the voice, no resume */
  stop: () => void;
  /** say the current sentence again (after an overlay closed) */
  resume: () => void;
}

/** The ElevenLabs voice id that is really sent. */
function voiceIdOf(voice: string): string {
  return isVoiceId(voice) ? voice : DEFAULT_VOICE;
}

export function useReadAloud(opts: ReadAloudOptions): ReadAloud {
  const [speaking, setSpeaking] = useState(false);
  const [session, setSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // The newest options. Every callback below reads from here, so its
  // identity stays the same for as long as the reader is open.
  const latest = useRef(opts);
  latest.current = opts;
  // A token per reading: a newer reading (or a stop) supersedes the old.
  const token = useRef(0);
  // The position whose sentence is being read — or was read last.
  const startedKey = useRef<string | null>(null);
  // Audio already on its way from ElevenLabs. The key carries the voice
  // and the speed, so a voice change can never serve yesterday's audio.
  const ready = useRef(new Map<string, Promise<ArrayBuffer>>());
  // The phone is offline: its own voice reads until the network is back.
  const forcedSystem = useRef(false);

  const {
    follow,
    positionKey,
    voice,
    voiceURI,
    speed,
    engine,
    key,
  } = opts;

  // The phone can speak if it has a key for ElevenLabs, or its own voice.
  const supported = useMemo(
    () => speechSupported() || !!key,
    [key],
  );

  /** ElevenLabs only reads when it has a key to read with. */
  // A stale voice setting (a phone voice name from the old engine) is
  // not an ElevenLabs id: voiceIdOf() gives the default voice instead.
  const canUseEleven = wantsEleven({ engine, key });

  /** Say it once — the note must not be rewritten on every sentence. */
  const note = useCallback((msg: string | null) => {
    setError((old) => (old === msg ? old : msg));
  }, []);

  /** Stop everything — both engines. */
  const stop = useCallback(() => {
    token.current += 1;
    startedKey.current = null;
    sessionRef.current = false;
    setSession(false);
    setSpeaking(false);
    stopSpeech();
    stopAudio();
  }, []);

  /** The audio for a text: from the cache if it is already here. */
  const fetchAudio = useCallback(async (text: string): Promise<ArrayBuffer> => {
    const c = latest.current;
    const voiceId = voiceIdOf(c.voice);
    const k = `${voiceId}\u0000${c.speed}\u0000${text}`;
    const hit = ready.current.get(k);
    if (hit) return hit;
    const p = speakAudio(text, voiceId, c.key, c.speed).catch((e) => {
      // A failed request must not be cached — it is fetched again.
      ready.current.delete(k);
      throw e;
    });
    ready.current.set(k, p);
    return p;
  }, []);

  // A new voice (or speed, or key) makes every cached clip worthless.
  useEffect(() => {
    ready.current.clear();
  }, [voice, speed, key]);

  /** Start the next sentence while this one is being read. */
  const prefetch = useCallback(
    (text: string) => {
      if (!text) return;
      if (forcedSystem.current) return;
      void fetchAudio(text).catch(() => {
        /* it will be fetched again when it is needed */
      });
    },
    [fetchAudio],
  );

  /**
   * Say one sentence with the engine the user picked.
   *
   * Resolves when the sentence has been read, or when this reading was
   * superseded or stopped. The caller tells the two apart by the token.
   */
  const play = useCallback(async (text: string, mine: number): Promise<void> => {
    const c = latest.current;
    // Whatever was still sounding belongs to the reading we replace.
    stopAudio();
    let played = false;
    if (wantsEleven(c) && !forcedSystem.current) {
      try {
        const data = await fetchAudio(text);
        if (token.current !== mine) return;
        await playAudio(data);
        if (token.current !== mine) return;
        played = true;
        // The stored voice was a phone voice name — the default voice
        // read instead. Say so, once.
        note(
          voiceIdOf(c.voice) !== c.voice
            ? "That voice belongs to the phone, not to ElevenLabs — the default voice is reading. Pick one from the voice list."
            : null,
        );
      } catch (e) {
        if (token.current !== mine) return;
        // ElevenLabs could not do it — say so, and let the phone's
        // voice take over, instead of swapping engines silently.
        const err = e instanceof Error ? e : new Error("The voice failed.");
        // Out of reach: the phone's own voice reads from here on, and
        // the reader is told once — not once per sentence.
        if (isNetworkError(err) && (!isOnline() || err instanceof TypeError)) {
          forcedSystem.current = true;
          note("You're offline — the phone's voice is reading instead.");
        } else {
          note(speakError(err));
        }
      }
    } else if (c.engine === "eleven") {
      // ElevenLabs was asked for, but there is no key to read with.
      note(
        "No ElevenLabs key — the phone's voice is reading instead. Add a key in Settings.",
      );
    }
    if (played || token.current !== mine) return;
    try {
      await speakSystem(text, { rate: c.speed, voiceURI: c.voiceURI });
    } catch {
      /* this device has no speech at all */
    }
  }, [fetchAudio, note]);

  /**
   * Read the sentence at the reader's position, then turn the page.
   *
   * `force` reads it again even when it is already being read — used
   * when the voice itself changed. Without it, the same position is
   * never started twice.
   */
  const begin = useCallback(
    (force: boolean) => {
      const c = latest.current;
      if (c.blocked()) return;
      if (!force && startedKey.current === c.positionKey) return;
      startedKey.current = c.positionKey;
      const text = c.currentText().trim();
      if (!text) {
        stop();
        return;
      }
      const mine = ++token.current;
      setSpeaking(true);
      // The next sentence is on its way while this one is read.
      if (wantsEleven(c)) prefetch(c.nextText());
      void (async () => {
        await play(text, mine);
        // Superseded or stopped: the newer reading owns the reader.
        if (token.current !== mine) return;
        setSpeaking(false);
        if (!sessionRef.current) return;
        // The end of the book stops the session.
        if (!latest.current.advance()) stop();
      })();
    },
    [play, prefetch, stop],
  );

  /** The speaker button: start the session, or stop it. */
  const toggle = useCallback(() => {
    if (sessionRef.current) {
      stop();
      return;
    }
    sessionRef.current = true;
    setSession(true);
    begin(false);
  }, [begin, stop]);

  /** An overlay closed — pick the sentence up again. */
  const resume = useCallback(() => {
    if (!sessionRef.current && !latest.current.follow) return;
    begin(false);
  }, [begin]);

  // Moving while the session runs speaks the new sentence straight away.
  useEffect(() => {
    if (!sessionRef.current && !follow) return;
    begin(false);
  }, [positionKey, follow, begin]);

  // A new voice, speed, key or engine: the sentence is read again, in
  // the new voice — only when something is being read right now.
  const voiceSignature = `${voiceIdOf(voice)}\u0000${speed}\u0000${key}\u0000${engine}\u0000${voiceURI}`;
  const lastSignature = useRef(voiceSignature);
  useEffect(() => {
    if (lastSignature.current === voiceSignature) return;
    lastSignature.current = voiceSignature;
    if (startedKey.current === null) return;
    begin(true);
  }, [voiceSignature, begin]);

  // Follow-aloud off, session off — the voice is silent.
  useEffect(() => {
    if (!follow && !sessionRef.current) stop();
  }, [follow, stop]);

  // A new key or engine lets the phone's voice read again.
  useEffect(() => void (forcedSystem.current = false), [key, engine]);

  // The connection came back: ElevenLabs reads again, and the reader is
  // told once.
  useOnline(() => {
    if (!forcedSystem.current) return;
    forcedSystem.current = false;
    if (latest.current.engine !== "eleven") return;
    note("Back online — ElevenLabs is reading again.");
    if (sessionRef.current) begin(true);
  });

  // Never talk to nobody: leaving the reader stops the voice.
  useEffect(
    () => () => {
      token.current += 1;
      stopSpeech();
      stopAudio();
    },
    [],
  );

  return {
    speaking,
    session,
    supported,
    actual: canUseEleven && !forcedSystem.current ? "eleven" : "system",
    error,
    clearError: () => note(null),
    toggle,
    stop,
    resume,
  };
}

/** ElevenLabs is the engine, and a key is there to read with. */
function wantsEleven(c: Pick<ReadAloudOptions, "engine" | "key">): boolean {
  return c.engine === "eleven" && !!c.key;
}
