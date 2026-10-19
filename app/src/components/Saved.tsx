// Saved: every bookmark, highlight and note for one book, in reading order.
// Tapping an entry opens the reader at that exact item+part.
import { useEffect, useMemo, useState } from "react";
import type { BookDoc } from "../lib/types";
import { getBook, getMarks } from "../lib/db";
import { splitS } from "../lib/parts";

interface Props {
  bookId: string;
  onBack: () => void;
  onJump: (bookId: string, item: number, part: number) => void;
}

interface Entry {
  partKey: string;
  item: number;
  part: number;
  text: string;
  page: number;
  highlight: boolean;
  bookmark: boolean;
  note: string | null;
}

function TypeIcon({ e }: { e: Entry }) {
  // Show every type the part carries, in the popup's row order.
  return (
    <span className="saved-icons" aria-hidden>
      {e.bookmark && (
        <svg viewBox="0 0 24 24">
          <path d="M6 3h12v18l-6-4-6 4z" />
        </svg>
      )}
      {e.highlight && (
        <svg viewBox="0 0 24 24">
          <path d="M9 11l7-7 4 4-7 7z" />
          <path d="M9 11l-5 5v4h4l5-5" />
        </svg>
      )}
      {e.note && (
        <svg viewBox="0 0 24 24">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      )}
    </span>
  );
}

export default function Saved({ bookId, onBack, onJump }: Props) {
  const [book, setBook] = useState<BookDoc | null>(null);
  const [marks, setMarks] = useState<Record<string, { highlight: boolean; bookmark: boolean; note: string | null }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await getBook(bookId);
      const m = await getMarks(bookId).catch(() => ({}));
      if (!cancelled) {
        setBook(b ?? null);
        setMarks(m);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const entries = useMemo<Entry[]>(() => {
    if (!book) return [];
    const out: Entry[] = [];
    for (const [partKey, mk] of Object.entries(marks)) {
      if (!mk.highlight && !mk.bookmark && !mk.note) continue;
      const [iStr, pStr] = partKey.split(":");
      const i = parseInt(iStr, 10);
      const p = parseInt(pStr, 10);
      const item = book.items[i];
      if (!item || !Number.isFinite(i) || !Number.isFinite(p)) continue;
      const parts = splitS(item.text);
      if (p >= parts.length) continue;
      out.push({
        partKey,
        item: i,
        part: p,
        text: parts[p],
        page: item.page + 1,
        highlight: mk.highlight,
        bookmark: mk.bookmark,
        note: mk.note,
      });
    }
    out.sort((a, b) => a.item - b.item || a.part - b.part);
    return out;
  }, [book, marks]);

  return (
    <div data-testid="saved-page" className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-xl px-6 pt-14 pb-24">
        <div className="flex items-center gap-3">
          <button
            data-testid="saved-back"
            onClick={onBack}
            aria-label="Back"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
          >
            ← Back
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Saved</h1>
            {book && (
              <p className="truncate text-xs text-muted-foreground">{book.title}</p>
            )}
          </div>
        </div>

        {entries.length === 0 ? (
          <p data-testid="saved-empty" className="mt-10 text-center text-sm text-muted-foreground">
            Nothing saved yet — bookmarks, highlights and notes you add while
            reading will show up here.
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            {entries.map((e) => (
              <button
                key={e.partKey}
                data-testid={`saved-entry-${e.item}-${e.part}`}
                onClick={() => onJump(bookId, e.item, e.part)}
                className="saved-entry"
              >
                <TypeIcon e={e} />
                <span className="min-w-0 flex-1 text-left">
                  <span className="saved-snippet">
                    {e.text.length > 140 ? e.text.slice(0, 140) + "…" : e.text}
                  </span>
                  {e.note && <span className="saved-note">{e.note}</span>}
                  <span className="saved-page">Page {e.page}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
