// Read aloud (v4.8): the voice, and the reading session.
//
// The speaker button in the reader is a play/pause, exactly like the
// auto-scroll button: tap it and the book reads itself, sentence by
// sentence, the page turning as it goes. Tap it again and it stops.
//
// Two engines:
//  · HD  — Kokoro-82M on the phone (lib/kokoro.ts). Needs the one-time
//          download; the sheet asks for it before anything happens.
//  · system — the phone's own speech engine. Always available, always
//          a bit rough.
//
// Overlays (the action popup, a selection, the meaning card, the Ask
// sheet) hold the voice until they close.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  kokoroInstalled,
  kokoroSupported,
  speakKokoro,
  stopKokoroAudio,
  type LoadProgress,
} from "../../lib/kokoro";
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
  /** true while an overlay owns the screen */
  blocked: () => boolean;
  /** move to the next sentence; false at the end of the book */
  advance: () => boolean;
  /** the chosen HD voice */
  voice: string;
  /** speaking speed, 0.5 – 2 */
  speed: number;
  /** which engine to use */
  engine: "hd" | "system";
}

export interface ReadAloud {
  /** the voice is talking right now */
  speaking: boolean;
  /** the reading session runs */
  session: boolean;
  /** the HD engine is on the phone */
  hdInstalled: boolean;
  /** this device can speak at all (either engine) */
  supported: boolean;
  /** the HD engine is loading or downloading */
  loading: LoadProgress | null;
  /** start or stop the reading session */
  toggle: () => void;
  /** stop the voice, no resume */
  stop: () => void;
  /** say the current sentence again (after an overlay closed) */
  resume: () => void;
  /** ask the phone whether the HD engine is on it (after an install) */
  refresh: () => Promise<boolean>;
}

export function useReadAloud(opts: ReadAloudOptions): ReadAloud {
  const [speaking, setSpeaking] = useState(false);
  const [session, setSession] = useState(false);
  const [hdInstalled, setHdInstalled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState<LoadProgress | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // A token, so a cancelled utterance can never switch the button back.
  const token = useRef(0);

  const { follow, positionKey, currentText, blocked, advance, voice, speed, engine } =
    opts;

  /** The engine may have been installed while the reader was open. */
  const refresh = useCallback(async () => {
    const on = await kokoroInstalled();
    setHdInstalled(on);
    return on;
  }, []);

  useEffect(() => {
    let alive = true;
    setSupported(speechSupported() || kokoroSupported());
    void kokoroInstalled().then((v) => {
      if (alive) setHdInstalled(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Stop everything — both engines. */
  const stop = useCallback(() => {
    token.current += 1;
    sessionRef.current = false;
    setSession(false);
    setSpeaking(false);
    setLoading(null);
    stopSpeech();
    stopKokoroAudio();
  }, []);

  /** Say a text with the engine the user picked. */
  const play = useCallback(
    async (text: string): Promise<void> => {
      const mine = ++token.current;
      setSpeaking(true);
      try {
        // The engine may have been installed a moment ago (the sheet just
        // finished downloading it) — ask the phone, not the old state.
        const onDevice =
          engine === "hd" && (hdInstalled || (await refresh()));
        if (onDevice) {
          try {
            await speakKokoro(text, voice, speed, (p) => setLoading(p));
            if (token.current !== mine) return;
            setLoading(null);
            return;
          } catch {
            // The HD engine gave up — the phone's voice takes over.
            stopKokoroAudio();
          }
        }
        await speakSystem(text, { rate: speed });
      } catch {
        /* this device has no speech at all */
      }
      if (token.current === mine) {
        setLoading(null);
        setSpeaking(false);
      }
    },
    [engine, hdInstalled, voice, speed, refresh],
  );

  /** Say the current sentence; when it ends, turn the page and go on. */
  const readCurrent = useCallback(async () => {
    if (blocked()) return;
    const text = currentText().trim();
    if (!text) {
      stop();
      return;
    }
    await play(text);
    if (!sessionRef.current) return;
    // The end of the book stops the session.
    if (!advance()) stop();
  }, [blocked, currentText, play, advance, stop]);

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
    hdInstalled,
    supported,
    loading,
    toggle,
    stop,
    resume,
    refresh,
  };
}
