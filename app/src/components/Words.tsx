// Words: the personal knowledge base — every saved word/phrase with its
// meaning, grouped by day. Tapping a row jumps the reader to the sentence
// where the word was found.
import { useEffect, useMemo, useState } from "react";
import {
  deleteVocab,
  listVocab,
  type VocabRecord,
} from "../lib/db";
import { groupByDay } from "../lib/vocab";

interface Props {
  bookId?: string;
  onJump: (bookId: string, item: number, part: number) => void;
}

export default function Words({ bookId, onJump }: Props) {
  const [words, setWords] = useState<VocabRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    listVocab(bookId)
      .then((rows) => {
        if (!cancelled) setWords(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const groups = useMemo(() => groupByDay(words), [words]);

  const remove = (id: string) => {
    setWords((prev) => prev.filter((w) => w.id !== id));
    deleteVocab(id).catch(() => {});
  };

  return (
    <div data-testid="words-list" className="min-h-0">
      {groups.length === 0 ? (
        <p
          data-testid="words-empty"
          className="mt-10 text-center text-sm text-muted-foreground"
        >
          No words saved yet — long-press a word while reading, ask for its
          meaning, and save it here.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.key} data-testid={`word-day-${g.key}`}>
            <div className="mt-8 mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-foreground">
                {g.label}
              </h2>
              <span className="text-xs text-muted-foreground">
                {g.records.length} word{g.records.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-3">
              {g.records.map((w) => (
                <div
                  key={w.id}
                  data-testid={`word-row-${w.id}`}
                  className="saved-entry"
                >
                  <button
                    onClick={() => onJump(w.bookId, w.item, w.part)}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Jump to ${w.text}`}
                  >
                    <span className="saved-snippet">{w.text}</span>
                    {w.defs[0] && (
                      <span className="saved-note">
                        {w.defs[0].length > 140
                          ? w.defs[0].slice(0, 140) + "…"
                          : w.defs[0]}
                      </span>
                    )}
                    <span className="saved-page">
                      {w.bookTitle} · Page {w.page}
                    </span>
                  </button>
                  <button
                    data-testid={`word-del-${w.id}`}
                    onClick={() => remove(w.id)}
                    aria-label={`Delete ${w.text}`}
                    className="del"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
