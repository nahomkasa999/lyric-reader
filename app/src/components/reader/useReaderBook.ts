// The book (v4.13): what the reader is reading.
//
// The book, the place in it, the marks and the saved words — loaded
// when the reader opens, and the place saved when it moves.
import { useEffect, useRef, useState } from "react";
import {
  getBook,
  getMarks,
  getProgress,
  listVocab,
  saveProgress,
  type VocabRecord,
} from "../../lib/db";
import { migratePosition } from "../../lib/types";
import type { BookDoc, Position } from "../../lib/types";
import { splitS } from "../../lib/parts";
import type { Mark } from "./readerTypes";

export interface ReaderBook {
  book: BookDoc | null;
  bookRef: React.RefObject<BookDoc | null>;
  /** the place in the book */
  pos: Position;
  setPos: React.Dispatch<React.SetStateAction<Position>>;
  posRef: React.RefObject<Position>;
  /** the marks of the book, by part key */
  marks: Record<string, Mark>;
  setMarks: (fn: (prev: Record<string, Mark>) => Record<string, Mark>) => void;
  /** the saved words of the book */
  vocab: VocabRecord[];
  setVocab: (fn: (prev: VocabRecord[]) => VocabRecord[]) => void;
  /** the book could not be opened */
  failed: boolean;
}

export function useReaderBook(
  bookId: string,
  /** the chrome flashes once, the first time the book opens */
  onFirstOpen: (ms?: number) => void,
): ReaderBook {
  const [book, setBook] = useState<BookDoc | null>(null);
  const [pos, setPos] = useState<Position>({ item: 0, part: 0 });
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [vocab, setVocab] = useState<VocabRecord[]>([]);
  const [failed, setFailed] = useState(false);
  const bookRef = useRef<BookDoc | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const openRef = useRef(onFirstOpen);
  openRef.current = onFirstOpen;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await getBook(bookId);
      if (!b) {
        setFailed(true);
        return;
      }
      const saved = await getProgress(bookId);
      const savedMarks = await getMarks(bookId).catch(() => ({}));
      const savedVocab = await listVocab(bookId).catch(() => []);
      if (cancelled) return;
      setBook(b);
      bookRef.current = b;
      setMarks(savedMarks);
      setVocab(savedVocab);
      // First open: flash the chrome briefly so the user sees where
      // everything is, then it hides itself for full-focus reading.
      openRef.current(1600);
      if (saved) {
        const m = migratePosition(b.items, saved);
        const pl = splitS(b.items[m.item]?.text ?? "");
        setPos({
          item: m.item,
          part: Math.min(m.part, Math.max(0, pl.length - 1)),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // --- Persist position (debounced) + flush on pagehide ---
  const posSaveRef = useRef(pos);
  posSaveRef.current = pos;
  useEffect(() => {
    if (!book) return;
    const t = window.setTimeout(() => {
      saveProgress(bookId, posSaveRef.current).catch(() => {});
    }, 500);
    const flush = () => {
      saveProgress(bookId, posSaveRef.current).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pagehide", flush);
    };
  }, [book, bookId, pos]);

  return {
    book,
    bookRef,
    pos,
    setPos,
    posRef,
    marks,
    setMarks,
    vocab,
    setVocab,
    failed,
  };
}
