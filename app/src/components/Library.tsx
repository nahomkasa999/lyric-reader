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
}

export default function Library({ onOpen }: Props) {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
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

  const onPasteSave = useCallback(async () => {
    if (!pasteText.trim()) return;
    const title = pasteTitle.trim() || "Pasted text";
    setPasteOpen(false);
    setPasteText("");
    setPasteTitle("");
    await addBook(title, () => extractTxt(pasteText, title, "paste"));
  }, [pasteText, pasteTitle, addBook]);

  const onDelete = useCallback(
    async (id: string) => {
      await deleteBook(id);
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-xl px-6 pt-14 pb-24">
        <p className="text-xs font-mono uppercase tracking-widest text-primary">
          Lyric Reader
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Your library
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload a book, then read it one sentence at a time.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            data-testid="upload-btn"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Working…" : "Upload book"}
          </button>
          <button
            data-testid="paste-btn"
            onClick={() => setPasteOpen(true)}
            disabled={busy !== null}
            className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium disabled:opacity-50"
          >
            Paste text
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.epub,.txt,.md"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
            data-testid="file-input"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          PDF, EPUB or TXT. Everything stays on this device.
        </p>

        {error && (
          <div
            data-testid="import-error"
            className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            {error}
          </div>
        )}

        <div className="mt-10 space-y-3">
          {books.map((b) => {
            const pct = Math.round((progress[b.id] ?? 0) * 100);
            return (
              <div
                key={b.id}
                data-testid={`book-card-${b.id}`}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    className="text-left flex-1"
                    onClick={() => onOpen(b.id)}
                    data-testid={`open-book-${b.id}`}
                  >
                    <p className="font-medium leading-snug">{b.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {b.totalSentences} sentences · {pct}% read
                    </p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                  <button
                    onClick={() => onDelete(b.id)}
                    aria-label={`Delete ${b.title}`}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </button>
                </div>
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

      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
          <div className="w-full max-w-xl rounded-t-2xl border border-border bg-card p-6 sm:rounded-2xl">
            <h2 className="text-lg font-semibold">Paste text</h2>
            <input
              data-testid="paste-title"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="Title (optional)"
              className="mt-4 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
            <textarea
              data-testid="paste-text"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the text you want to read…"
              rows={8}
              className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPasteOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground"
              >
                Cancel
              </button>
              <button
                data-testid="paste-save"
                onClick={onPasteSave}
                disabled={!pasteText.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Start reading
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
