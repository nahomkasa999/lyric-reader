// The marks of a part (v4.13): highlight, bookmark, note, copy.
//
// The popup acts on ONE part — the one the reader tapped — and every
// mark is written to the book, so it is there when the book is opened
// again.
import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import { setNote, toggleMark } from "../../lib/db";
import type { Mark, PopTarget } from "./readerTypes";

export interface MarksOptions {
  /** the book the marks belong to */
  bookId: string;
  /** the part the popup acts on */
  popRef: RefObject<PopTarget | null>;
  /** the parts of the book, per item */
  partsRef: RefObject<string[][]>;
  /** the marks of the book, by part key */
  marks: Record<string, Mark>;
  setMarks: (fn: (prev: Record<string, Mark>) => Record<string, Mark>) => void;
  /** the note being written */
  noteDraft: string;
}

export interface ReaderMarks {
  /** the marks of the part the popup is on */
  popMark: Mark;
  /** turn a mark on or off */
  toggleMarkKind: (kind: "highlight" | "bookmark") => Promise<void>;
  /** write the note */
  saveNote: () => Promise<void>;
  /** throw the note away */
  deleteNote: () => Promise<void>;
  /** copy the part to the clipboard */
  doCopy: (copied: boolean) => Promise<boolean>;
}

export function useReaderMarks(opts: MarksOptions): ReaderMarks {
  const noteDraftRef = useRef(opts.noteDraft);
  noteDraftRef.current = opts.noteDraft;

  const popKey = opts.popRef.current
    ? `${opts.popRef.current.i}:${opts.popRef.current.p}`
    : "";
  const popMark: Mark = (popKey && opts.marks[popKey]) || {
    highlight: false,
    bookmark: false,
    note: null,
  };

  const toggleMarkKind = useCallback(
    async (kind: "highlight" | "bookmark") => {
      const p = opts.popRef.current;
      if (!p) return;
      try {
        const m = await toggleMark(opts.bookId, `${p.i}:${p.p}`, kind);
        opts.setMarks((prev) => ({ ...prev, [`${p.i}:${p.p}`]: m }));
      } catch {
        /* ignore */
      }
    },
    [opts],
  );

  const saveNote = useCallback(async () => {
    const p = opts.popRef.current;
    if (!p) return;
    try {
      const m = await setNote(opts.bookId, `${p.i}:${p.p}`, noteDraftRef.current);
      opts.setMarks((prev) => ({ ...prev, [`${p.i}:${p.p}`]: m }));
    } catch {
      /* ignore */
    }
  }, [opts]);

  const deleteNote = useCallback(async () => {
    const p = opts.popRef.current;
    if (!p) return;
    try {
      const m = await setNote(opts.bookId, `${p.i}:${p.p}`, null);
      opts.setMarks((prev) => ({ ...prev, [`${p.i}:${p.p}`]: m }));
    } catch {
      /* ignore */
    }
  }, [opts]);

  const doCopy = useCallback(
    async (copied: boolean) => {
      const p = opts.popRef.current;
      if (!p) return copied;
      const text = opts.partsRef.current[p.i]?.[p.p] ?? "";
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    [opts],
  );

  return { popMark, toggleMarkKind, saveNote, deleteNote, doCopy };
}
