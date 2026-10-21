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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  playAudio,
  speakAudio,
  speakError,
  stopAudio,
} from "../../lib/elevenlabs";
import {
  speak as speakSystem,
  speechSupported,
  stopSpeech,
} from "../../lib/speech";

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

export function useReadAloud(opts: ReadAloudOptions): ReadAloud {
  const [speaking, setSpeaking] = useState(false);
  const [session, setSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // A token, so a cancelled utterance can never switch the button back.
  const token = useRef(0);
  // Audio already on its way from ElevenLabs. The key carries the voice
  // and the speed, so a voice change can never serve yesterday's audio.
  const ready = useRef(new Map<string, Promise<ArrayBuffer>>());

  const {
    follow,
    positionKey,
    currentText,
    nextText,
    blocked,
    advance,
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
  const canUseEleven = engine === "eleven" && !!key;

  /** Say it once — the note must not be rewritten on every sentence. */
  const note = useCallback((msg: string | null) => {
    setError((old) => (old === msg ? old : msg));
  }, []);

  /** Stop everything — both engines. */
  const stop = useCallback(() => {
    token.current += 1;
    sessionRef.current = false;
    setSession(false);
    setSpeaking(false);
    stopSpeech();
    stopAudio();
  }, []);

  /** The audio for a text: from the cache if it is already here. */
  const fetchAudio = useCallback(
    async (text: string): Promise<ArrayBuffer> => {
      const k = `${voice}\u0000${speed}\u0000${text}`;
      const hit = ready.current.get(k);
      if (hit) return hit;
      const p = speakAudio(text, voice, key, speed).catch((e) => {
        // A failed request must not be cached — it is fetched again.
        ready.current.delete(k);
        throw e;
      });
      ready.current.set(k, p);
      return p;
    },
    [voice, key, speed],
  );

  // A new voice (or speed) makes every cached clip worthless.
  useEffect(() => {
    ready.current.clear();
  }, [voice, speed, key]);

  /** Start the next sentence while this one is being read. */
  const prefetch = useCallback(
    (text: string) => {
      if (!text) return;
      void fetchAudio(text).catch(() => {
        /* it will be fetched again when it is needed */
      });
    },
    [fetchAudio],
  );

  /** Say a text with the engine the user picked. */
  const play = useCallback(
    async (text: string): Promise<void> => {
      const mine = ++token.current;
      setSpeaking(true);
      let played = false;
      if (canUseEleven) {
        try {
          const data = await fetchAudio(text);
          if (token.current !== mine) return;
          await playAudio(data);
          played = true;
          note(null);
        } catch (e) {
          // ElevenLabs could not do it — say so, and let the phone's
          // voice take over. Silently swapping engines is what made the
          // reader sound like "the default thing" with no explanation.
          note(speakError(e));
          played = false;
        }
      } else if (engine === "eleven") {
        // ElevenLabs was asked for, but there is no key to read with.
        note(
          "No ElevenLabs key — the phone's voice is reading instead. Add a key in Settings.",
        );
      }
      if (!played) {
        try {
          await speakSystem(text, { rate: speed, voiceURI });
        } catch {
          /* this device has no speech at all */
        }
      }
      if (token.current === mine) setSpeaking(false);
    },
    [canUseEleven, engine, fetchAudio, speed, voiceURI, note],
  );

  /** Say the current sentence; when it ends, turn the page and go on. */
  const readCurrent = useCallback(async () => {
    if (blocked()) return;
    const text = currentText().trim();
    if (!text) {
      stop();
      return;
    }
    const spoken = play(text);
    // The next sentence is on its way while this one is read.
    if (canUseEleven) prefetch(nextText());
    await spoken;
    if (!sessionRef.current) return;
    // The end of the book stops the session.
    if (!advance()) stop();
  }, [blocked, currentText, play, prefetch, nextText, canUseEleven, advance, stop]);

  /** The speaker button: start the session, or stop it. */
  const toggle = useCallback(() => {
    if (sessionRef.current) {
      stop();
      return;
    }
    sessionRef.current = true;
    setSession(true);
    void readCurrent();
  }, [readCurrent, stop]);

  /** An overlay closed — pick the sentence up again. */
  const resume = useCallback(() => {
    if (!sessionRef.current && !follow) return;
    if (blocked()) return;
    void readCurrent();
  }, [follow, blocked, readCurrent]);

  // Moving while the session runs speaks the new sentence straight away.
  useEffect(() => {
    if (!sessionRef.current && !follow) return;
    if (blocked()) return;
    void readCurrent();
  }, [positionKey, follow, blocked, readCurrent]);

  // Follow-aloud off, session off — the voice is silent.
  useEffect(() => {
    if (!follow && !sessionRef.current) stop();
  }, [follow, stop]);

  // Never talk to nobody: leaving the reader stops the voice.
  useEffect(() => () => stopSpeech(), []);

  return {
    speaking,
    session,
    supported,
    actual: canUseEleven ? "eleven" : "system",
    error,
    clearError: () => note(null),
    toggle,
    stop,
    resume,
  };
}
