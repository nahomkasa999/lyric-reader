// Read aloud (v4.7): the reader's voice.
//
// The hook owns one thing — the browser's speech engine — and knows
// nothing about pages. The reader tells it what is on screen; the hook
// decides when to say it and when to shut up.
//
// Follow along: with read aloud on, every sentence the reader moves to is
// spoken. Overlays (the action popup, a selection, the meaning card, the
// Ask sheet) hold the voice until they close.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speak, speechSupported, stopSpeech } from "../../lib/speech";

export interface ReadAloudOptions {
  /** read aloud is on in Settings */
  enabled: boolean;
  /** changes whenever the reader moves — a new sentence */
  positionKey: string;
  /** the text on screen right now */
  currentText: () => string;
  /** true while an overlay owns the screen */
  blocked: () => boolean;
  /** speaking speed, 0.5 – 2 */
  rate: number;
  /** the voice the user picked ("" = browser default) */
  voiceURI: string;
}

export interface ReadAloud {
  /** the voice is talking right now */
  speaking: boolean;
  /** this device can speak at all */
  supported: boolean;
  /** the speaker button: talk, or stop talking */
  toggle: () => void;
  /** stop the voice, no resume */
  stop: () => void;
  /** say the current sentence again (after an overlay closed) */
  resume: () => void;
}

export function useReadAloud(opts: ReadAloudOptions): ReadAloud {
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  // A token, so a cancelled utterance can never switch the button back.
  const token = useRef(0);
  const spoken = useRef("");
  const supported = useMemo(() => speechSupported(), []);

  const { enabled, positionKey, currentText, blocked, rate, voiceURI } = opts;

  const stop = useCallback(() => {
    token.current += 1;
    spoken.current = "";
    stopSpeech();
    setSpeaking(false);
  }, []);

  const say = useCallback(
    async (text: string) => {
      if (!supported || !text.trim()) return;
      // Already saying exactly this — never restart it.
      if (speakingRef.current && spoken.current === text) return;
      stopSpeech();
      const mine = ++token.current;
      spoken.current = text;
      setSpeaking(true);
      try {
        await speak(text, { rate, voiceURI });
      } catch {
        /* this device has no speech engine */
      }
      if (token.current === mine) {
        spoken.current = "";
        setSpeaking(false);
      }
    },
    [supported, rate, voiceURI],
  );

  const resume = useCallback(() => {
    if (!enabled) return;
    if (blocked()) return;
    void say(currentText());
  }, [enabled, blocked, currentText, say]);

  const toggle = useCallback(() => {
    if (speakingRef.current) {
      stop();
      return;
    }
    void say(currentText());
  }, [say, stop, currentText]);

  // Follow along: a new sentence is spoken as the reader moves.
  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    resume();
  }, [enabled, positionKey, resume, stop]);

  // Never talk to nobody: leaving the reader stops the voice.
  useEffect(() => () => stopSpeech(), []);

  return { speaking, supported, toggle, stop, resume };
}
