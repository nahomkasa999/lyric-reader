import { useCallback, useEffect, useState } from "react";
import Library from "./components/Library";
import Reader from "./components/reader/Reader";
import Saved from "./components/Saved";
import Settings from "./components/Settings";
import AssistantSheet from "./components/AssistantSheet";
import GlassNav, { type NavKey } from "./components/GlassNav";
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
import { startIndexing, kickIndexer, refreshAll } from "./lib/indexBook";
import AmbientBackground from "./components/AmbientBackground";

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
  // Home is the landing view — the Continue Reading hero resumes the book
  // the user read last.
  const [view, setView] = useState<View>("library");
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [settingsReturn, setSettingsReturn] = useState<"library" | "reader">(
    "library",
  );
  const [savedBookId, setSavedBookId] = useState<string | null>(null);
  const [savedReturn, setSavedReturn] = useState<"library" | "reader">(
    "library",
  );
  const [savedTab, setSavedTab] = useState<"saved" | "words">("saved");
  /** The book the bottom nav opens Saved/Words for. */
  const [navBookId, setNavBookId] = useState<string | null>(readLastBook);
  const [seeded, setSeeded] = useState(false);
  /** v4.13: the assistant — open over whatever is on screen. */
  const [assistant, setAssistant] = useState<{
    bookId?: string;
    bookTitle?: string;
    item?: number;
  } | null>(null);

  // The whole app is dark-only (the reader mockup is pure black).
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // v4.13: the indexing queue wakes up once, when the app opens. A job
  // that was interrupted by a reload picks up where it stopped.
  useEffect(() => {
    void refreshAll();
    kickIndexer();
  }, []);

  // If the remembered book no longer exists (deleted), forget it.
  useEffect(() => {
    const id = readLastBook();
    if (!id) return;
    getBook(id)
      .then((b) => {
        if (!b) {
          try {
            localStorage.removeItem(LAST_BOOK_KEY);
          } catch {
            /* ignore */
          }
          setNavBookId((cur) => (cur === id ? null : cur));
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
        if (!already) {
          await saveBook(book);
          // v4.12: index the sample too, so the assistant has something
          // to answer from the moment the app opens.
          startIndexing(book);
        }
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
    // The last-book key stays: it is what the Continue Reading hero
    // resumes from. (The app lands on Home now, not in the reader.)
    setOpenBookId(null);
    setView("library");
  }, []);

  const openSettingsFrom = useCallback((from: "library" | "reader") => {
    setSettingsReturn(from);
    setView("settings");
  }, []);

  const openSaved = useCallback(
    (
      bookId: string,
      from: "library" | "reader",
      tab: "saved" | "words" = "saved",
    ) => {
      setSavedBookId(bookId);
      setSavedReturn(from);
      setSavedTab(tab);
      setView("saved");
    },
    [],
  );

  /** The glass bottom nav — shared by every non-reader view. */
  const navTo = useCallback(
    (key: NavKey) => {
      if (key === "home") {
        setView("library");
        return;
      }
      if (key === "settings") {
        setSettingsReturn("library");
        setView("settings");
        return;
      }
      const id =
        view === "saved" && savedBookId ? savedBookId : navBookId;
      if (!id) return;
      openSaved(id, "library", key === "words" ? "words" : "saved");
    },
    [view, savedBookId, navBookId, openSaved],
  );

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

  /** The view on screen — the assistant opens over whichever it is. */
  let content: React.ReactNode;
  if (view === "settings") {
    content = (
      <>
        <AmbientBackground />
        <Settings
          onBack={() =>
            setView(settingsReturn === "reader" && openBookId ? "reader" : "library")
          }
        />
        <GlassNav
          active="settings"
          onNavigate={navTo}
          canOpenBook={!!navBookId}
        />
      </>
    );
  } else if (view === "saved" && savedBookId) {
    content = (
      <>
        <AmbientBackground />
        <Saved
          bookId={savedBookId}
          initialTab={savedTab}
          onTabChange={setSavedTab}
          onBack={() =>
            setView(savedReturn === "reader" && openBookId ? "reader" : "library")
          }
          onJump={jumpToSaved}
        />
        <GlassNav
          active={savedTab === "words" ? "words" : "saved"}
          onNavigate={navTo}
          canOpenBook={!!savedBookId}
        />
      </>
    );
  } else if (view === "reader" && openBookId) {
    content = (
      <>
        <AmbientBackground />
        <Reader
          bookId={openBookId}
          onBack={closeBook}
          onOpenSettings={() => openSettingsFrom("reader")}
          onOpenSaved={() => openSaved(openBookId, "reader")}
          onOpenAssistant={(title, item) =>
            setAssistant({ bookId: openBookId, bookTitle: title, item })
          }
          assistantOpen={!!assistant}
        />
      </>
    );
  } else {
    content = (
      <>
        <AmbientBackground />
        <Library
          onOpen={openBook}
          onOpenSettings={() => openSettingsFrom("library")}
          onOpenSaved={(bookId) => openSaved(bookId, "library")}
          onActiveBook={setNavBookId}
        />
        <GlassNav
          active="home"
          onNavigate={navTo}
          canOpenBook={!!navBookId}
        />
      </>
    );
  }

  return (
    <>
      {content}
      {assistant && (
        <AssistantSheet
          bookId={assistant.bookId}
          bookTitle={assistant.bookTitle}
          item={assistant.item}
          onClose={() => setAssistant(null)}
          onJump={(bookId, item) => {
            setAssistant(null);
            jumpToSaved(bookId, item, 0);
          }}
          onOpenSettings={() => {
            setAssistant(null);
            openSettingsFrom(view === "reader" ? "reader" : "library");
          }}
        />
      )}
    </>
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
