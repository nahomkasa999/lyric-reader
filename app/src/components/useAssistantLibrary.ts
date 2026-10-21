// The assistant's knowledge base (v4.13).
//
// Two numbers, both real: how many passages the library holds (they are
// written the moment a book is imported — no key, no network) and how
// many of them are EMBEDDED, which is what the queue is working on.
//
// The old version showed a 1.2-second "Indexing…" flag that meant
// nothing. This one reads the queue.
import { useCallback, useEffect, useState } from "react";
import {
  indexLabel,
  indexLibraryNow,
  onIndexProgress,
  pauseIndexing,
  resumeIndexing,
  retryIndexing,
} from "../lib/indexBook";
import type { IndexProgress } from "../lib/indexJobs";
import { passageCount } from "../lib/passages";
import { isOnline } from "../lib/online";

export interface AssistantLibrary {
  /** how many passages the knowledge base holds */
  indexed: number;
  /** is the library being indexed right now */
  indexing: boolean;
  /** index every book that is not indexed yet */
  indexLibrary: () => void;
  /** the progress of every queued book */
  jobs: IndexProgress[];
  /** the label of the first job that is not done */
  label: string | null;
  /** try one book again */
  retry: (bookId: string) => void;
  /** stop the queue */
  pause: () => void;
  /** start the queue again */
  resume: () => void;
  /** is the phone online right now */
  online: boolean;
}

/**
 * The knowledge base of ONE book.
 *
 * The assistant is about the book the reader has open, so the numbers
 * it shows are that book's: how many of its passages are searchable,
 * and how far its embedding has got.
 */
export function useAssistantLibrary(bookId?: string): AssistantLibrary {
  const [indexed, setIndexed] = useState(0);
  const [jobs, setJobs] = useState<IndexProgress[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [online, setOnline] = useState(() => isOnline());

  useEffect(() => {
    let cancelled = false;
    const count = () => {
      if (!bookId) {
        if (!cancelled) setIndexed(0);
        return;
      }
      passageCount(bookId)
        .then((n) => {
          if (!cancelled) setIndexed(n);
        })
        .catch(() => {});
    };
    count();
    // The index grows while a book is being indexed — keep the count true.
    const off = onIndexProgress((p) => {
      // The strip is about the book on screen.
      if (bookId && p.bookId !== bookId) return;
      setJobs((prev) => {
        const rest = prev.filter((j) => j.bookId !== p.bookId);
        return [p, ...rest].sort((a, b) => a.bookId.localeCompare(b.bookId));
      });
      count();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [bookId]);

  const indexLibrary = useCallback(() => {
    setIndexing(true);
    void indexLibraryNow()
      .catch(() => {})
      .finally(() => {
        setTimeout(() => setIndexing(false), 1200);
      });
  }, []);

  const retry = useCallback((bookId: string) => {
    void retryIndexing(bookId).catch(() => {});
  }, []);

  const pause = useCallback(() => {
    void pauseIndexing().catch(() => {});
  }, []);

  const resume = useCallback(() => {
    void resumeIndexing().catch(() => {});
  }, []);

  // The phone's connection: a hint, but a useful one.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const first = jobs.find((j) => j.state !== "done");

  return {
    indexed,
    indexing,
    indexLibrary,
    jobs,
    label: first ? indexLabel(first) : null,
    retry,
    pause,
    resume,
    online,
  };
}
