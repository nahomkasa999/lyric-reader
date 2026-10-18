import { useCallback, useEffect, useState } from "react";
import Library from "./components/Library";
import Reader from "./components/Reader";
import { extractTxt } from "./lib/extract";
import {
  getBook,
  isSampleSeeded,
  listBooks,
  markSampleSeeded,
  saveBook,
} from "./lib/db";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "./lib/sample";

const LAST_BOOK_KEY = "lyric-reader.last-book";

function readLastBook(): string | null {
  try {
    return localStorage.getItem(LAST_BOOK_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const [openBookId, setOpenBookId] = useState<string | null>(readLastBook);
  const [seeded, setSeeded] = useState(false);

  // The whole app is dark-only (the reader mockup is pure black).
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // If the remembered book no longer exists (deleted), forget it.
  useEffect(() => {
    if (!openBookId) return;
    getBook(openBookId)
      .then((b) => {
        if (!b) {
          setOpenBookId(null);
          try {
            localStorage.removeItem(LAST_BOOK_KEY);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
  }, []);

  // Seed the sample book once so the reader can be tried instantly.
  useEffect(() => {
    if (isSampleSeeded()) {
      setSeeded(true);
      return;
    }
    extractTxt(SAMPLE_TEXT, SAMPLE_TITLE, "sample")
      .then(async (book) => {
        // Guard against double-seeding (e.g. StrictMode remounts in dev).
        const existing = await listBooks();
        const already = existing.some(
          (b) => b.source === "sample" && b.title === SAMPLE_TITLE,
        );
        if (!already) await saveBook(book);
        markSampleSeeded();
        setSeeded(true);
      })
      .catch((e) => {
        console.error("sample seed failed", e);
        setSeeded(true);
      });
  }, []);

  const openBook = useCallback((id: string) => {
    setOpenBookId(id);
    try {
      localStorage.setItem(LAST_BOOK_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);
  const closeBook = useCallback(() => {
    setOpenBookId(null);
    try {
      localStorage.removeItem(LAST_BOOK_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  if (!seeded) {
    return (
      <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Preparing your library…</p>
      </div>
    );
  }

  return openBookId ? (
    <Reader bookId={openBookId} onBack={closeBook} />
  ) : (
    <Library onOpen={openBook} />
  );
}
