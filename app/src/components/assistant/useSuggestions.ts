// The questions an empty thread offers (v4.13).
//
// They are built from the headings of the book the reader has open —
// that is what the reader is about to ask about. A book without
// headings gets the three general questions.
import { useEffect, useState } from "react";
import { passagesOfBook } from "../../lib/passages";
import { DEFAULT_SUGGESTIONS } from "./useAssistantTypes";

export function useSuggestions(bookId?: string): string[] {
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);

  useEffect(() => {
    let cancelled = false;
    if (!bookId) {
      setSuggestions(DEFAULT_SUGGESTIONS);
      return;
    }
    passagesOfBook(bookId)
      .then((rows) => {
        if (cancelled) return;
        const heads: string[] = [];
        for (const row of rows) {
          const h = row.heading.trim();
          if (h && !heads.includes(h)) heads.push(h);
          if (heads.length >= 3) break;
        }
        setSuggestions(heads.length ? heads : DEFAULT_SUGGESTIONS);
      })
      .catch(() => {
        if (!cancelled) setSuggestions(DEFAULT_SUGGESTIONS);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  return suggestions;
}
