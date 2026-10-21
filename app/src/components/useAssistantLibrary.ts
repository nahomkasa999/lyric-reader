// The assistant's knowledge base (v4.12).
//
// How much of the library is indexed, and the one button that indexes
// the rest: the books that were imported before this feature existed
// have no passages, and without them the assistant has nothing to find.
import { useCallback, useEffect, useState } from "react";
import { getBook, listBooks } from "../lib/db";
import { startIndexing, onIndexProgress } from "../lib/indexBook";
import { indexSize } from "../lib/vectorIndex";

export interface AssistantLibrary {
  /** how many passages the knowledge base holds */
  indexed: number;
  /** is the library being indexed right now */
  indexing: boolean;
  /** index every book that is not indexed yet */
  indexLibrary: () => void;
}

export function useAssistantLibrary(): AssistantLibrary {
  const [indexed, setIndexed] = useState(0);
  const [indexing, setIndexing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    indexSize()
      .then((n) => {
        if (!cancelled) setIndexed(n);
      })
      .catch(() => {});
    // The index grows while a book is being indexed — keep the count true.
    const off = onIndexProgress(() => {
      indexSize()
        .then((n) => {
          if (!cancelled) setIndexed(n);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const indexLibrary = useCallback(() => {
    setIndexing(true);
    void (async () => {
      const metas = await listBooks().catch(() => []);
      for (const meta of metas) {
        const book = await getBook(meta.id).catch(() => undefined);
        if (book) startIndexing(book);
      }
      // The flag is a hint for the button, not a job tracker.
      setTimeout(() => setIndexing(false), 1200);
    })();
  }, []);

  return { indexed, indexing, indexLibrary };
}
