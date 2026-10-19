import { useCallback, useEffect, useState } from "react";
import Library from "./components/Library";
import Reader from "./components/Reader";
import Saved from "./components/Saved";
import Settings from "./components/Settings";
import { SettingsProvider } from "./lib/settings";
import { extractKeyFromHash, setApiKey } from "./lib/apikey";
import { discoverModel } from "./lib/gemini";
import { extractTxt } from "./lib/extract";
import {
  getBook,
  isSampleSeeded,
  listBooks,
  markSampleSeeded,
  saveBook,
  saveProgress,
} from "./lib/db";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "./lib/sample";

const LAST_BOOK_KEY = "lyric-reader.last-book";

type View = "library" | "reader" | "settings" | "saved";

function readLastBook(): string | null {
  try {
    return localStorage.getItem(LAST_BOOK_KEY);
  } catch {
    return null;
  }
}

function Shell() {
  // If a book was open last time, land straight back in the reader.
  const [view, setView] = useState<View>(() =>
    readLastBook() ? "reader" : "library",
  );
  const [openBookId, setOpenBookId] = useState<string | null>(readLastBook);
  const [settingsReturn, setSettingsReturn] = useState<"library" | "reader">(
    "library",
  );
  const [savedBookId, setSavedBookId] = useState<string | null>(null);
  const [savedReturn, setSavedReturn] = useState<"library" | "reader">(
    "library",
  );
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
    setView("reader");
  }, []);

  const closeBook = useCallback(() => {
    setOpenBookId(null);
    try {
      localStorage.removeItem(LAST_BOOK_KEY);
    } catch {
      /* ignore */
    }
    setView("library");
  }, []);

  const openSettingsFrom = useCallback((from: "library" | "reader") => {
    setSettingsReturn(from);
    setView("settings");
  }, []);

  const openSaved = useCallback((bookId: string, from: "library" | "reader") => {
    setSavedBookId(bookId);
    setSavedReturn(from);
    setView("saved");
  }, []);

  /** Jump the reader to an exact saved part: persist the position first,
      then open the book — the reader restores it as the saved position. */
  const jumpToSaved = useCallback(
    (bookId: string, item: number, part: number) => {
      saveProgress(bookId, { item, part })
        .catch(() => {})
        .finally(() => {
          setOpenBookId(bookId);
          try {
            localStorage.setItem(LAST_BOOK_KEY, bookId);
          } catch {
            /* ignore */
          }
          setView("reader");
        });
    },
    [],
  );

  if (!seeded) {
    return (
      <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Preparing your library…</p>
      </div>
    );
  }

  if (view === "settings") {
    return (
      <Settings
        onBack={() =>
          setView(settingsReturn === "reader" && openBookId ? "reader" : "library")
        }
      />
    );
  }

  if (view === "saved" && savedBookId) {
    return (
      <Saved
        bookId={savedBookId}
        onBack={() =>
          setView(savedReturn === "reader" && openBookId ? "reader" : "library")
        }
        onJump={jumpToSaved}
      />
    );
  }

  if (view === "reader" && openBookId) {
    return (
      <Reader
        bookId={openBookId}
        onBack={closeBook}
        onOpenSettings={() => openSettingsFrom("reader")}
        onOpenSaved={() => openSaved(openBookId, "reader")}
      />
    );
  }

  return (
    <Library
      onOpen={openBook}
      onOpenSettings={() => openSettingsFrom("library")}
      onOpenSaved={(bookId) => openSaved(bookId, "library")}
    />
  );
}

// v4.2: one-tap key setup links. If the app is opened at `.../#k=<key>`,
// store the key, strip the fragment immediately (it must not linger in the
// URL or browser history), auto-discover the model, and toast the result.
// Module flag keeps React 18 StrictMode's double-mount from firing twice.
let keyImportDone = false;

export default function App() {
  const [keyToast, setKeyToast] = useState<string | null>(null);

  useEffect(() => {
    if (keyImportDone) return;
    keyImportDone = true;
    const k = extractKeyFromHash(window.location.hash);
    if (!k) return;
    setApiKey(k);
    try {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    } catch {
      /* history API unavailable — the hash just stays */
    }
    discoverModel(k)
      .then((model) =>
        setKeyToast(
          model
            ? `Gemini key saved — using ${model}`
            : "Key saved, but the AI listed no models — check the key in Settings.",
        ),
      )
      .catch(() =>
        setKeyToast(
          "Key saved, but the AI couldn't be reached — try the Test button in Settings.",
        ),
      );
    const t = setTimeout(() => setKeyToast(null), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <SettingsProvider>
      <Shell />
      {keyToast && (
        <div
          data-testid="key-import-toast"
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] max-w-[92vw] rounded-full bg-primary px-4 py-2 text-center text-sm text-primary-foreground shadow-lg"
        >
          {keyToast}
        </div>
      )}
    </SettingsProvider>
  );
}
