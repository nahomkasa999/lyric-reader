// The meaning of a word (v4.13).
//
// Long-press a word, tap Meaning, and the card says what it means —
// and, when the AI is there, what it means in this sentence. The word
// can be saved. It is spoken only when the card's speaker is tapped.
import { useCallback } from "react";
import type React from "react";
import type { RefObject } from "react";
import { getEffectiveApiKey } from "../../lib/apikey";
import { saveVocab, type VocabRecord } from "../../lib/db";
import { geminiInContext, lookupMeaning } from "../../lib/meaning";
import type { BookDoc, Item, Position } from "../../lib/types";
import type { MeaningState, SelectionState } from "./readerTypes";

/** Cache of AI "as used in this sentence" lines: norm + sentence head -> line. */
const contextCache = new Map<string, string>();

export interface MeaningOptions {
  /** the card that is open, if any */
  meaningRef: RefObject<MeaningState | null>;
  /** the card changes */
  setMeaning: React.Dispatch<React.SetStateAction<MeaningState | null>>;
  /** the selection the pill is showing */
  selRef: RefObject<SelectionState | null>;
  /** the book being read */
  bookRef: RefObject<BookDoc | null>;
  posRef: RefObject<Position>;
  itemsRef: RefObject<Item[]>;
  partsRef: RefObject<string[][]>;
  /** the saved words, so "already saved" can be answered */
  vocabRef: RefObject<VocabRecord[]>;
  /** the pill goes away, but the pause stays */
  collapseSelection: (resume?: boolean) => void;
  /** the card pauses the playback */
  pauseAuto: () => void;
  /** the voice stops while the card is open */
  stopVoice: () => void;
  /** the saved words change */
  setVocab: (fn: (prev: VocabRecord[]) => VocabRecord[]) => void;
}

export interface ReaderMeaning {
  openMeaning: () => Promise<void>;
  copySelection: () => Promise<void>;
  saveWord: () => Promise<void>;
}

export function useReaderMeaning(opts: MeaningOptions): ReaderMeaning {
  const { setMeaning } = opts;

  const openMeaning = useCallback(async () => {
    const s = opts.selRef.current;
    const b = opts.bookRef.current;
    if (!s || !b) return;
    const { item } = opts.posRef.current;
    const it = opts.itemsRef.current[item];
    const sentence =
      opts.partsRef.current[item]?.[opts.posRef.current.part] ??
      it?.text ??
      "";
    const text = s.text;
    // The meaning card pauses playback transiently. Pause first, then
    // collapse without resuming (the resume comes on card close).
    opts.pauseAuto();
    opts.stopVoice();
    opts.collapseSelection(false);
    setMeaning({ text, status: "loading", saved: false });
    const key = getEffectiveApiKey();
    const outcome = await lookupMeaning({ text, sentence, apiKey: key });
    // The card may have been closed while the lookup was in flight.
    if (opts.meaningRef.current?.text !== text) return;
    if (outcome.status === "ready" && outcome.model) {
      const model = outcome.model;
      const norm = text.toLowerCase().trim();
      const alreadySaved = opts.vocabRef.current.some((v) => v.norm === norm);
      setMeaning({ text, status: "ready", model, saved: alreadySaved });
      // The AI "in this sentence" line for single words never blocks the
      // dictionary result — it appends when it arrives (cached per norm).
      if (key && !/\s/.test(text.trim()) && !model.inContext) {
        const cacheKey = `${norm}::${sentence.slice(0, 120)}`;
        const cached = contextCache.get(cacheKey);
        if (cached) {
          setMeaning((prev) =>
            prev && prev.text === text
              ? { ...prev, model: { ...prev.model!, inContext: cached } }
              : prev,
          );
        } else {
          void geminiInContext(text.trim(), sentence, key).then((line) => {
            if (!line) return;
            contextCache.set(cacheKey, line);
            setMeaning((prev) =>
              prev && prev.text === text
                ? { ...prev, model: { ...prev.model!, inContext: line } }
                : prev,
            );
          });
        }
      }
    } else {
      setMeaning({
        text,
        status: outcome.status,
        saved: false,
        query: outcome.query,
      });
    }
  }, [opts]);

  const copySelection = useCallback(async () => {
    const s = opts.selRef.current;
    opts.collapseSelection();
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s.text);
    } catch {
      /* ignore */
    }
  }, [opts]);

  const saveWord = useCallback(async () => {
    const m = opts.meaningRef.current;
    const b = opts.bookRef.current;
    if (!m?.model || !b) return;
    const { item, part } = opts.posRef.current;
    const it = opts.itemsRef.current[item];
    const defs = m.model.groups.flatMap((g) =>
      g.defs.map((d) => `${g.partOfSpeech} — ${d.definition}`),
    );
    const rec = await saveVocab({
      bookId: b.id,
      text: m.model.word || m.text,
      norm: m.text.toLowerCase().trim(),
      phonetic: m.model.phonetic,
      defs,
      contextMeaning: m.model.inContext,
      bookTitle: b.title,
      page: (it?.page ?? 0) + 1,
      item,
      part,
      sentence: it?.text ?? "",
    }).catch(() => null);
    if (!rec) return;
    opts.setVocab((prev) => {
      const rest = prev.filter((r) => r.id !== rec.id);
      return [rec, ...rest].sort((a, z) => z.savedAt - a.savedAt);
    });
    setMeaning((prev) => (prev ? { ...prev, saved: true } : prev));
  }, [opts]);

  return { openMeaning, copySelection, saveWord };
}
