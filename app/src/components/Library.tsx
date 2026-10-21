// Home: the landing view.
// Order (DESIGN.md): glass header → Continue Reading hero → Add Book →
// Your Library → (the glass bottom nav lives in App, it is shared by every
// non-reader view).
import { useCallback, useEffect, useMemo, useState } from "react";
import { extractFile, extractMedia, extractTxt } from "../lib/extract";
import { getElevenLabsKey } from "../lib/elevenlabs";
import { isMediaFile } from "../lib/transcribe";
import {
  indexLabel,
  onIndexProgress,
  startIndexing,
} from "../lib/indexBook";
import { deleteIndex } from "../lib/vectorIndex";
import {
  deleteBook,
  getBook,
  getProgress,
  listBooks,
  saveBook,
} from "../lib/db";
import type { BookMeta } from "../lib/db";
import { migratePosition, progressOf } from "../lib/types";
import type { Position } from "../lib/types";
import AddBookSheet from "./AddBookSheet";

/** The book the user read last — the hero resumes it. */
const LAST_BOOK_KEY = "lyric-reader.last-book";

function readLastBook(): string | null {
  try {
    return localStorage.getItem(LAST_BOOK_KEY);
  } catch {
    return null;
  }
}

interface Props {
  onOpen: (bookId: string) => void;
  onOpenSettings: () => void;
  onOpenSaved: (bookId: string) => void;
  /** v4.12: the assistant — ask the whole library */
  onOpenAssistant: () => void;
  /**
   * Reports which book the Continue Reading card points at (null when the
   * library is empty) so the bottom nav can open Saved/Words for it.
   */
  onActiveBook?: (bookId: string | null) => void;
}

export default function Library({
  onOpen,
  onOpenSettings,
  onOpenSaved,
  onOpenAssistant,
  onActiveBook,
}: Props) {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** v4.12: how the indexing of each book is going. */
  const [indexing, setIndexing] = useState<Record<string, string>>({});

  useEffect(
    () =>
      onIndexProgress((p) => {
        setIndexing((prev) => ({ ...prev, [p.bookId]: indexLabel(p) }));
      }),
    [],
  );

  const refresh = useCallback(async () => {
    const list = await listBooks();
    setBooks(list);
    const p: Record<string, number> = {};
    for (const b of list) {
      const book = await getBook(b.id);
      const pos: Position | undefined = await getProgress(b.id);
      p[b.id] = book
        ? progressOf(book, migratePosition(book.items, pos ?? { item: 0, part: 0 }))
        : 0;
    }
    setProgress(p);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addBook = useCallback(
    async (title: string, make: () => Promise<import("../lib/types").BookDoc>) => {
      setBusy(title || "Importing…");
      setError(null);
      try {
        const book = await make();
        if (book.totalSentences === 0)
          throw new Error("No readable text found in that file.");
        await saveBook(book);
        // v4.12: the passages of the book are embedded in the background,
        // so the assistant can find them later.
        startIndexing(book);
        await refresh();
        onOpen(book.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      } finally {
        setBusy(null);
      }
    },
    [onOpen, refresh],
  );

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      // v4.12: a video or an audio file is transcribed, and the
      // transcript becomes a book like any other.
      if (isMediaFile(f)) {
        await addBook(f.name, () =>
          extractMedia(f, getElevenLabsKey()),
        );
        return;
      }
      await addBook(f.name, () => extractFile(f));
    },
    [addBook],
  );

  const onPaste = useCallback(
    async (raw: string, rawTitle: string) => {
      if (!raw.trim()) return;
      const text = raw;
      const title = rawTitle.trim() || "Pasted text";
      await addBook(title, () => extractTxt(text, title, "paste"));
    },
    [addBook],
  );

  const onDelete = useCallback(
    async (id: string) => {
      await deleteBook(id);
      // v4.12: the passages of a deleted book go with it.
      await deleteIndex(id).catch(() => {});
      // The hero must not point at a book that is gone.
      if (readLastBook() === id) {
        try {
          localStorage.removeItem(LAST_BOOK_KEY);
        } catch {
          /* ignore */
        }
      }
      await refresh();
    },
    [refresh],
  );

  // The book the hero points at: the one read last, else the newest one.
  const active = useMemo(() => {
    const last = readLastBook();
    return books.find((b) => b.id === last) ?? books[0] ?? null;
  }, [books]);

  useEffect(() => {
    onActiveBook?.(active?.id ?? null);
  }, [active?.id, onActiveBook]);

  const activePct = active ? Math.round((progress[active.id] ?? 0) * 100) : 0;

  return (
    <div
      data-testid="library-root"
      className={`relative min-h-dvh text-foreground ${
        // While the sheet is open it is modal: it sits above the bottom nav.
        sheetOpen ? "z-50 sheet-open" : "z-[1]"
      }`}
      style={{ fontFamily: "var(--lr-font)" }}
    >
      {/* Glass header: title left, glass pills right. */}
      <header
        data-testid="library-header"
        className="glass home-header sticky top-0 z-30"
      >
        <div className="mx-auto flex max-w-xl items-center gap-3 px-5 pb-3 pt-[calc(14px+env(safe-area-inset-top))]">
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
              Lyric Reader
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              Read one sentence at a time.
            </p>
          </div>
          <button
            data-testid="library-assistant-btn"
            onClick={onOpenAssistant}
            aria-label="Ask your library"
            className="glass-pill press"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5z" />
            </svg>
          </button>
          {active && (
            <button
              data-testid="library-saved-btn"
              onClick={() => onOpenSaved(active.id)}
              aria-label="Saved marks"
              className="glass-pill press"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M6 3h12v18l-6-4-6 4z" />
              </svg>
            </button>
          )}
          <button
            data-testid="settings-gear"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="glass-pill press"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-36 pt-6">
        {/* Continue Reading — one glass card, tap = resume. */}
        {active && (
          <button
            data-testid="continue-reading"
            onClick={() => onOpen(active.id)}
            className="home-hero glass press"
          >
            <span className="home-label block">Continue reading</span>
            <span className="mt-2 block truncate text-[20px] font-semibold leading-snug">
              {active.title}
            </span>
            <span className="mt-1 block text-[13px] text-muted-foreground">
              {activePct}% read · {active.totalSentences} sentences
            </span>
            <span className="home-bar mt-3">
              <i style={{ width: `${activePct}%` }} />
            </span>
          </button>
        )}

        <button
          data-testid="add-book-btn"
          onClick={() => {
            setError(null);
            setSheetOpen(true);
          }}
          className="home-cta press mt-5"
        >
          Add Book
        </button>

        <section className="mt-8">
          <h2 className="home-label">Your Library</h2>
          <div data-testid="book-list" className="mt-3 space-y-3">
            {books.map((b) => {
              const pct = Math.round((progress[b.id] ?? 0) * 100);
              return (
                <div
                  key={b.id}
                  data-testid={`book-card-${b.id}`}
                  className="home-row glass-lite"
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpen(b.id)}
                    data-testid={`open-book-${b.id}`}
                  >
                    <p className="truncate text-[15px] font-medium leading-snug">
                      {b.title}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {b.totalSentences} sentences · {pct}% read
                      {indexing[b.id] ? ` · ${indexing[b.id]}` : ""}
                    </p>
                    <span className="home-bar mt-2">
                      <i style={{ width: `${pct}%` }} />
                    </span>
                  </button>
                  <button
                    onClick={() => onDelete(b.id)}
                    aria-label={`Delete ${b.title}`}
                    data-testid={`delete-book-${b.id}`}
                    className="press shrink-0 rounded-md px-2 py-1 text-lg leading-none text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {books.length === 0 && (
              <p
                data-testid="library-empty"
                className="text-sm text-muted-foreground"
              >
                No books yet — add one above to start reading.
              </p>
            )}
          </div>
        </section>
      </main>

      {sheetOpen && (
        <AddBookSheet
          busy={busy !== null}
          error={error}
          onClose={() => {
            setSheetOpen(false);
            setError(null);
          }}
          onFiles={onFiles}
          onPaste={onPaste}
        />
      )}
    </div>
  );
}
