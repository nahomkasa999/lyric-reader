// The voice of the reader (v4.13).
//
// The book reads itself: the hook owns the voice and the session, and
// the reader tells it what is on screen and lets it turn the page. The
// voice picker opens from the ⋯ menu and from a long-press on the
// speaker.
import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import { stepParts } from "../../lib/types";
import type { Position } from "../../lib/types";
import { useReadAloud, type ReadAloud } from "./useReadAloud";

export interface VoiceOptions {
  /** the parts of the book, per item */
  partsRef: RefObject<string[][]>;
  /** where the reader is */
  posRef: RefObject<Position>;
  /** where the reader goes */
  setPos: (p: Position) => void;
  /** the overlays that hold the voice */
  popRef: RefObject<object | null>;
  selRef: RefObject<object | null>;
  meaningRef: RefObject<object | null>;
  assistantOpenRef: RefObject<boolean>;
  voiceSheetRef: RefObject<boolean>;
  outlineOpenRef: RefObject<boolean>;
  vocabPreviewRef: RefObject<object | null>;
  /** the current item and part — the sentence that is read */
  item: number;
  part: number;
  /** follow the reader, sentence by sentence */
  follow: boolean;
  /** the ElevenLabs voice id */
  voice: string;
  /** the phone's own voice */
  systemVoice: string;
  /** the speaking speed */
  rate: number;
  /** which engine reads */
  engine: "eleven" | "system";
  /** the reader's own ElevenLabs key */
  key: string;
  /** the menu that opened the picker goes away with it */
  setMenuOpen: (v: boolean) => void;
  /** the chrome stays up while the picker is open */
  showChrome: (ms?: number) => void;
  /** a swallowed gesture must not act for a moment */
  suppressUntil: RefObject<number>;
  /** the voice, for the rest of the reader */
  voiceRef: RefObject<ReadAloud | null>;
}

export interface ReaderVoice {
  voice: ReadAloud;
  /** the picker is open */
  voiceSheet: boolean;
  /** open the picker */
  openVoice: () => void;
  /** close the picker */
  closeVoiceSheet: () => void;
  closeVoiceSheetRef: RefObject<() => void>;
}

export function useReaderVoice(opts: VoiceOptions): ReaderVoice {
  const [voiceSheet, setVoiceSheet] = useState(false);
  const voiceSheetRef = useRef(voiceSheet);
  voiceSheetRef.current = voiceSheet;

  /** The text on screen right now. */
  const currentText = useCallback(() => {
    const { item, part } = opts.posRef.current;
    return opts.partsRef.current[item]?.[part] ?? "";
  }, [opts]);

  const blocked = useCallback(
    () =>
      !!opts.popRef.current ||
      !!opts.selRef.current ||
      !!opts.meaningRef.current ||
      !!opts.assistantOpenRef.current ||
      !!opts.voiceSheetRef.current ||
      !!opts.outlineOpenRef.current ||
      !!opts.vocabPreviewRef.current,
    [opts],
  );

  /** The session turns the page itself: forward one part, or stop at the end. */
  const advance = useCallback(() => {
    const before = opts.posRef.current;
    const next = stepParts(opts.partsRef.current, before, 1);
    if (next.item === before.item && next.part === before.part) return false;
    opts.setPos(next);
    return true;
  }, [opts]);

  /** The sentence after this one — fetched while this one is read. */
  const nextText = useCallback(() => {
    const { item, part } = opts.posRef.current;
    const next = stepParts(opts.partsRef.current, { item, part }, 1);
    if (next.item === item && next.part === part) return "";
    return opts.partsRef.current[next.item]?.[next.part] ?? "";
  }, [opts]);

  const voice = useReadAloud({
    follow: opts.follow,
    positionKey: `${opts.item}:${opts.part}`,
    currentText,
    nextText,
    blocked,
    advance,
    voice: opts.voice,
    voiceURI: opts.systemVoice,
    speed: opts.rate,
    engine: opts.engine,
    key: opts.key,
  });
  opts.voiceRef.current = voice;

  // The picker, opened from the reader itself — the ⋯ menu and a
  // long-press on the speaker both land here.
  const wasReading = useRef(false);
  const openVoice = useCallback(() => {
    if (Date.now() < opts.suppressUntil.current) return;
    wasReading.current = !!opts.voiceRef.current?.session;
    opts.voiceRef.current?.stop();
    // The menu that opened the picker goes away with it.
    opts.setMenuOpen(false);
    setVoiceSheet(true);
    opts.showChrome(4000);
  }, [opts]);

  const closeVoiceSheet = useCallback(() => {
    setVoiceSheet(false);
    if (wasReading.current) {
      wasReading.current = false;
      // The book was reading: start it again, in the new voice.
      opts.voiceRef.current?.toggle();
    }
  }, [opts]);
  const closeVoiceSheetRef = useRef(closeVoiceSheet);
  closeVoiceSheetRef.current = closeVoiceSheet;

  return { voice, voiceSheet, openVoice, closeVoiceSheet, closeVoiceSheetRef };
}
