import { useCallback, useEffect, useRef, useState } from "react";
import { extractFile, extractTxt } from "../lib/extract";
import {
  deleteBook,
  getBook,
  getProgress,
  listBooks,
  saveBook,
} from "../lib/db";
import type { BookMeta } from "../lib/db";
import { progressOf } from "../lib/types";
import type { Position } from "../lib/types";

interface Props {
  onOpen: (bookId: string) => void;
  onOpenSettings: () => void;
}

export default function Library({ onOpen, onOpenSettings }: Props) {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const list = await listBooks();
    setBooks(list);
    const p: Record<string, number> = {};
    for (const b of list) {
      const book = await getBook(b.id);
      const pos: Position | undefined = await getProgress(b.id);
      p[b.id] = book ? progressOf(book, pos ?? { page: 0, sent: 0 }) : 0;
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
      await addBook(f.name, () => extractFile(f));
      if (fileRef.current) fileRef.current.value = "";
    },
    [addBook],
  );

  const onPasteGo = useCallback(async () => {
    if (!pasteText.trim()) return;
    const text = pasteText;
    const title = pasteTitle.trim() || "Pasted text";
    setPasteText("");
    setPasteTitle("");
    await addBook(title, () => extractTxt(text, title, "paste"));
  }, [pasteText, pasteTitle, addBook]);

  const onDelete = useCallback(
    async (id: string) => {
      await deleteBook(id);
      await refresh();
    },
    [refresh],
  );

  return (
    <div
      data-testid="library-root"
      className="min-h-dvh bg-background text-foreground"
      style={{ fontFamily: "var(--lr-font)" }}
    >
      <div className="mx-auto max-w-xl px-5 pt-10 pb-24">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em]">
              Lyric Reader
            </h1>
            <p className="sub mt-1 text-muted-foreground">
              Read one sentence at a time. Everything stays on your phone.
            </p>
          </div>
          <button
            data-testid="settings-gear"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="mt-1 shrink-0 rounded-lg border border-border bg-card p-2.5 text-muted-foreground"
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

        <label
          data-testid="upload-btn"
          className={`mt-6 block cursor-pointer rounded-xl bg-primary px-[18px] py-[14px] text-center text-sm font-semibold text-primary-foreground ${
            busy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {busy ? "Working…" : "Start reading a book"}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.epub,.txt,.md"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
            data-testid="file-input"
          />
        </label>

        <input
          data-testid="paste-title"
          value={pasteTitle}
          onChange={(e) => setPasteTitle(e.target.value)}
          placeholder="Title (optional)"
          className="mt-4 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring"
        />
        <textarea
          data-testid="paste-text"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Or paste text here"
          rows={4}
          className="mt-3 w-full rounded-xl border border-border bg-card px-3 py-3 text-sm outline-none focus:border-ring"
        />
        <button
          data-testid="paste-save"
          onClick={onPasteGo}
          disabled={!pasteText.trim() || busy !== null}
          className="mt-3 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium disabled:opacity-50"
        >
          Read pasted text
        </button>
        <p className="mt-3 text-xs text-muted-foreground">
          PDF, EPUB or TXT. Everything stays on this device.
        </p>

        {error && (
          <div
            data-testid="import-error"
            className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            {error}
          </div>
        )}

        <div data-testid="book-list" className="mt-8 space-y-3">
          {books.map((b) => {
            const pct = Math.round((progress[b.id] ?? 0) * 100);
            return (
              <div
                key={b.id}
                data-testid={`book-card-${b.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left"
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpen(b.id)}
                  data-testid={`open-book-${b.id}`}
                >
                  <p className="truncate text-[15px] font-medium leading-snug">
                    {b.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {b.totalSentences} sentences · {pct}% read
                  </p>
                </button>
                <button
                  onClick={() => onDelete(b.id)}
                  aria-label={`Delete ${b.title}`}
                  data-testid={`delete-book-${b.id}`}
                  className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </div>
            );
          })}
          {books.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No books yet — upload one above to start reading.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
