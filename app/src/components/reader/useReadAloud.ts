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
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // A token, so a cancelled utterance can never switch the button back.
  const token = useRef(0);
  // Audio already on its way from ElevenLabs, keyed by the text.
  const ready = useRef(new Map<string, ArrayBuffer>());

  const { follow, positionKey, currentText, nextText, blocked, advance, voice, speed, engine, key } =
    opts;

  // The phone can speak if it has a key for ElevenLabs, or its own voice.
  const supported = useMemo(
    () => speechSupported() || !!key,
    [key],
  );

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
      const hit = ready.current.get(text);
      if (hit) {
        ready.current.delete(text);
        return hit;
      }
      return speakAudio(text, voice, key, speed);
    },
    [voice, key, speed],
  );

  /** Start the next sentence while this one is being read. */
  const prefetch = useCallback(
    (text: string) => {
      if (!text || ready.current.has(text)) return;
      void fetchAudio(text)
        .then((buf) => ready.current.set(text, buf))
        .catch(() => {
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
      if (engine === "eleven" && key) {
        try {
          const data = await fetchAudio(text);
          if (token.current !== mine) return;
          await playAudio(data);
          played = true;
        } catch {
          // ElevenLabs could not do it — the phone's voice takes over.
          played = false;
        }
      }
      if (!played) {
        try {
          await speakSystem(text, { rate: speed });
        } catch {
          /* this device has no speech at all */
        }
      }
      if (token.current === mine) setSpeaking(false);
    },
    [engine, key, fetchAudio, speed],
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
    if (engine === "eleven" && key) prefetch(nextText());
    await spoken;
    if (!sessionRef.current) return;
    // The end of the book stops the session.
    if (!advance()) stop();
  }, [blocked, currentText, play, prefetch, nextText, engine, key, advance, stop]);

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

  return { speaking, session, supported, toggle, stop, resume };
}
