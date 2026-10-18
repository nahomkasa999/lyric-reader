import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookDoc, Position, Sentence } from "../lib/types";
import {
  progressOf,
  step,
  trailSentences,
  upcomingSentences,
} from "../lib/types";
import {
  getBook,
  getMarks,
  getProgress,
  saveProgress,
  toggleMark,
} from "../lib/db";
import { useSettings } from "../lib/settings";

interface Props {
  bookId: string;
  onBack: () => void;
  onOpenSettings: () => void;
}

const WHEEL_LOCK_MS = 600;
const WHEEL_THRESHOLD = 20;
const SWIPE_THRESHOLD = 48;
const TAP_SLOP = 12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Shrink very long sentences so they fit without scrolling. */
function currentFontPx(text: string, mainPx: number): number {
  const len = text.length;
  const f = len <= 90 ? 1 : len <= 170 ? 0.78 : len <= 280 ? 0.62 : 0.5;
  return Math.round(mainPx * f);
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
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
  );
}

function HighlightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 11l7-7 4 4-7 7z" />
      <path d="M9 11l-5 5v4h4l5-5" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

interface Mark {
  highlight: boolean;
  bookmark: boolean;
}

const NO_MARK: Mark = { highlight: false, bookmark: false };

/** Sentence text with highlight wash + bookmark dot. */
function SentenceText({
  s,
  mark,
}: {
  s: Sentence;
  mark: Mark;
}) {
  return (
    <span className={mark.highlight ? "hl-wash" : undefined}>
      {s.text}
      {mark.bookmark && <span className="bm-dot" aria-label="bookmarked" />}
    </span>
  );
}

function TrailLine({
  s,
  mark,
  upcoming,
}: {
  s: Sentence;
  mark: Mark;
  upcoming: boolean;
}) {
  const lineClass = upcoming ? "upcoming-line" : "trail-line";
  if (s.kind === "bullet") {
    return (
      <div
        className={`trail-li ${lineClass}`}
        style={{ marginLeft: s.level * 18 }}
      >
        <SentenceText s={s} mark={mark} />
      </div>
    );
  }
  if (s.kind === "heading") {
    return (
      <div className="trail-h">
        <SentenceText s={s} mark={mark} />
      </div>
    );
  }
  return (
    <span className={lineClass}>
      <SentenceText s={s} mark={mark} />{" "}
    </span>
  );
}

export default function Reader({ bookId, onBack, onOpenSettings }: Props) {
  const [book, setBook] = useState<BookDoc | null>(null);
  const [pos, setPos] = useState<Position>({ page: 0, sent: 0 });
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [failed, setFailed] = useState(false);

  // Modal + chrome state
  const [popupOpen, setPopupOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jumpVal, setJumpVal] = useState("");
  const [jumpHint, setJumpHint] = useState<string | null>(null);

  const { settings, update: updateSettings } = useSettings();

  const wheelLock = useRef(0);
  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const barTimer = useRef<number | null>(null);
  const prevPageRef = useRef(0);
  // Refs mirroring modal state so gesture handlers see fresh values.
  const popupOpenRef = useRef(false);
  const jumpOpenRef = useRef(false);
  const barVisibleRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await getBook(bookId);
      if (!b) {
        setFailed(true);
        return;
      }
      const saved = await getProgress(bookId);
      const savedMarks = await getMarks(bookId).catch(() => ({}));
      if (cancelled) return;
      setBook(b);
      setMarks(savedMarks);
      if (saved) {
        const page = Math.min(saved.page, b.pages.length - 1);
        const sent = Math.min(
          saved.sent,
          Math.max(0, (b.pages[page]?.sentences.length ?? 1) - 1),
        );
        const p = { page: Math.max(0, page), sent: Math.max(0, sent) };
        setPos(p);
        prevPageRef.current = p.page;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Persist reading position (debounced), plus an immediate flush when
  // the page is hidden so a quick close never loses the spot.
  const posRef = useRef(pos);
  posRef.current = pos;
  useEffect(() => {
    if (!book) return;
    const t = window.setTimeout(() => {
      saveProgress(bookId, posRef.current).catch(() => {});
    }, 500);
    const flush = () => {
      saveProgress(bookId, posRef.current).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pagehide", flush);
    };
  }, [book, bookId, pos]);

  // --- Bottom nav show/hide ---
  const showBar = useCallback((ms = 2500) => {
    barVisibleRef.current = true;
    setBarVisible(true);
    if (barTimer.current) window.clearTimeout(barTimer.current);
    barTimer.current = window.setTimeout(() => {
      barVisibleRef.current = false;
      setBarVisible(false);
    }, ms);
  }, []);
  const hideBar = useCallback(() => {
    if (barTimer.current) window.clearTimeout(barTimer.current);
    barVisibleRef.current = false;
    setBarVisible(false);
  }, []);
  useEffect(() => {
    return () => {
      if (barTimer.current) window.clearTimeout(barTimer.current);
    };
  }, []);

  // Briefly reveal the bar on every page change.
  useEffect(() => {
    if (!book) return;
    if (pos.page !== prevPageRef.current) {
      prevPageRef.current = pos.page;
      showBar(1200);
    }
  }, [book, pos.page, showBar]);

  const markOf = useCallback(
    (id: string): Mark => marks[id] ?? NO_MARK,
    [marks],
  );

  // --- Sentence stepping: exactly one per gesture, guaranteed by the
  // functional update (no races, no double-advance). ---
  const advance = useCallback(
    (dir: 1 | -1) => {
      if (!book) return;
      setPos((p) => step(book.pages, p, dir));
    },
    [book],
  );

  const gotoPage = useCallback(
    (page: number, sent = 0) => {
      if (!book) return;
      const p = clamp(page, 0, book.pages.length - 1);
      const s = clamp(
        sent,
        0,
        Math.max(0, (book.pages[p]?.sentences.length ?? 1) - 1),
      );
      setPos({ page: p, sent: s });
      popupOpenRef.current = false;
      jumpOpenRef.current = false;
      setPopupOpen(false);
      setJumpOpen(false);
      showBar(1200);
    },
    [book, showBar],
  );

  // --- Sections (chapter starts): pages whose first sentence is a heading ---
  const sectionPages = useMemo(
    () =>
      book
        ? book.pages
            .map((pg, i) => ({ i, h: pg.sentences[0]?.kind === "heading" }))
            .filter((x) => x.h)
            .map((x) => x.i)
        : [],
    [book],
  );

  const gotoPrevSection = useCallback(() => {
    const prev = sectionPages.filter((i) => i < pos.page);
    gotoPage(prev.length > 0 ? prev[prev.length - 1] : 0, 0);
  }, [sectionPages, pos.page, gotoPage]);

  const gotoNextSection = useCallback(() => {
    if (!book) return;
    const next = sectionPages.find((i) => i > pos.page);
    if (next !== undefined) {
      gotoPage(next, 0);
    } else {
      const last = book.pages.length - 1;
      gotoPage(last, book.pages[last].sentences.length - 1);
    }
  }, [sectionPages, pos.page, gotoPage, book]);

  // --- Jump sheet ---
  const openJump = useCallback(() => {
    hideBar();
    popupOpenRef.current = false;
    setPopupOpen(false);
    setJumpVal(String(pos.page + 1));
    setJumpHint(null);
    jumpOpenRef.current = true;
    setJumpOpen(true);
  }, [hideBar, pos.page]);

  const closeJump = useCallback(() => {
    jumpOpenRef.current = false;
    setJumpOpen(false);
  }, []);

  const submitJump = useCallback(() => {
    if (!book) return;
    const n = book.pages.length;
    const v = parseInt(jumpVal.trim(), 10);
    if (!Number.isFinite(v)) {
      setJumpHint(`Type a page number between 1 and ${n}.`);
      return;
    }
    const target = clamp(v, 1, n);
    if (target !== v) {
      // Out of range: clamp and jump, but keep the sheet open so the
      // hint is visible — the reader moves behind it.
      setJumpHint(`Only ${n} pages — jumped to page ${target}.`);
      setJumpVal(String(target));
      setPos({ page: target - 1, sent: 0 });
      showBar(1200);
      return;
    }
    gotoPage(target - 1, 0);
    closeJump();
  }, [book, jumpVal, gotoPage, closeJump, showBar]);

  // --- Action popup ---
  const openPopup = useCallback(() => {
    popupOpenRef.current = true;
    setPopupOpen(true);
    setCopied(false);
  }, []);
  const closePopup = useCallback(() => {
    popupOpenRef.current = false;
    setPopupOpen(false);
    setCopied(false);
  }, []);


  // --- Gestures ---
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const now = performance.now();
      if (now - wheelLock.current < WHEEL_LOCK_MS) return;
      if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;
      wheelLock.current = now;
      advance(e.deltaY > 0 ? 1 : -1);
    },
    [advance],
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = pointerStart.current;
      pointerStart.current = null;
      if (!s) return;
      // Modals open: let their backdrops handle the tap.
      if (popupOpenRef.current || jumpOpenRef.current) return;
      // Taps on the bottom nav's own buttons must not advance.
      if ((e.target as HTMLElement).closest("[data-bottom-nav]")) return;
      // Taps on the top bar must not advance either.
      if ((e.target as HTMLElement).closest("[data-topbar]")) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const dt = performance.now() - s.t;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (Math.max(adx, ady) < TAP_SLOP && dt < 400) {
        const h = window.innerHeight;
        const y = e.clientY;
        if (y > h * 0.85) {
          // Bottom hot-zone: reveal the bar instead of stepping.
          // (Always show, never toggle: the hover-reveal may already have
          // fired on the way in, and a toggle would instantly undo it.
          // The bar dismisses itself after 2.5s.)
          showBar();
          return;
        }
        // Tap: top third = back, bottom third = forward,
        // middle third = the sentence action popup.
        if (y < h / 3) advance(-1);
        else if (y > (2 * h) / 3) advance(1);
        else openPopup();
        return;
      }
      if (ady > SWIPE_THRESHOLD && ady > adx * 1.2) {
        advance(dy < 0 ? 1 : -1);
      }
    },
    [advance, openPopup, showBar, hideBar],
  );

  // Keyboard: arrows / space / page keys. One keypress = one sentence.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (popupOpenRef.current || jumpOpenRef.current) {
        if (e.key === "Escape") {
          closePopup();
          closeJump();
        }
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advance(1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        advance(-1);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        advance(1);
      } else if (e.key === "PageUp") {
        e.preventDefault();
        advance(-1);
      } else if (e.key === "Escape") {
        hideBar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, closePopup, closeJump, hideBar]);

  // A− / A+ adjust the same main-size setting the slider edits.
  const adjustMainSize = useCallback(
    (delta: number) => {
      updateSettings({
        mainSize: clamp(Math.round(settings.mainSize + delta), 18, 48),
      });
    },
    [settings.mainSize, updateSettings],
  );

  const page = book?.pages[pos.page];
  const sentences = page?.sentences ?? [];
  const current: Sentence | undefined = sentences[pos.sent];

  // Popup actions live here so they close over the fresh `current`
  // sentence (a stale closure here silently disabled them in v2 dev).
  const toggleMarkKind = useCallback(
    async (kind: "highlight" | "bookmark") => {
      if (!current) return;
      try {
        const m = await toggleMark(bookId, current.id, kind);
        setMarks((prev) => ({ ...prev, [current.id]: m }));
      } catch {
        /* ignore */
      }
    },
    [bookId, current],
  );

  const doCopy = useCallback(async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [current]);

  const trail = useMemo(
    () => (book ? trailSentences(book.pages, pos) : []),
    [book, pos],
  );
  const upcoming = useMemo(
    () => (book ? upcomingSentences(book.pages, pos) : []),
    [book, pos],
  );
  const pct = book ? Math.round(progressOf(book, pos) * 100) : 0;
  const totalPages = book?.pages.length ?? 0;

  // Bookmark list for the jump sheet (sorted by position).
  const sentenceIndex = useMemo(() => {
    const m = new Map<string, { page: number; sent: number; text: string }>();
    book?.pages.forEach((pg, pi) =>
      pg.sentences.forEach((s, si) =>
        m.set(s.id, { page: pi, sent: si, text: s.text }),
      ),
    );
    return m;
  }, [book]);
  const bookmarkList = useMemo(
    () =>
      Object.entries(marks)
        .filter(([, m]) => m.bookmark)
        .map(([id]) => ({ id, ...sentenceIndex.get(id)! }))
        .filter((b) => b.text)
        .sort((a, b) => a.page - b.page || a.sent - b.sent),
    [marks, sentenceIndex],
  );

  const currentMark = current ? markOf(current.id) : NO_MARK;

  if (failed) {
    return (
      <div className="reader-root fixed inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/80">This book could not be opened.</p>
          <button
            onClick={onBack}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Back to library
          </button>
        </div>
      </div>
    );
  }

  if (!book || !page) {
    return (
      <div className="reader-root fixed inset-0 flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading…</p>
      </div>
    );
  }

  const popupRows = [
    {
      key: "highlight" as const,
      label: "Highlight",
      testid: "popup-highlight",
      icon: <HighlightIcon />,
      active: currentMark.highlight,
      activeStyle: { background: "var(--lr-hl)", color: "#000" },
      onClick: () => toggleMarkKind("highlight"),
    },
    {
      key: "bookmark" as const,
      label: "Bookmark",
      testid: "popup-bookmark",
      icon: <BookmarkIcon />,
      active: currentMark.bookmark,
      activeStyle: {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
      },
      onClick: () => toggleMarkKind("bookmark"),
    },
    {
      key: "copy" as const,
      label: copied ? "Copied" : "Copy",
      testid: "popup-copy",
      icon: <CopyIcon />,
      active: copied,
      activeStyle: {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
      },
      onClick: doCopy,
    },
  ];

  return (
    <div
      data-testid="reader-root"
      className="reader-root fixed inset-0 flex flex-col overflow-hidden"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onMouseMove={(e) => {
        if (e.clientY > window.innerHeight * 0.85 && !barVisibleRef.current)
          showBar();
      }}
    >
      {/* Top bar: library | page button | A− A+ gear */}
      <header
        data-topbar
        className="reader-bar shrink-0"
        style={{ paddingTop: "calc(10px + env(safe-area-inset-top))" }}
      >
        <button onClick={onBack} aria-label="Back to library">
          ← Library
        </button>
        <button
          data-testid="page-btn"
          className="page-btn"
          onClick={openJump}
          aria-label="Go to page"
        >
          <span data-testid="page-label">
            {pos.page + 1} / {totalPages}
          </span>
        </button>
        <div className="flex items-center">
          <button aria-label="Smaller text" onClick={() => adjustMainSize(-2)}>
            A−
          </button>
          <button aria-label="Larger text" onClick={() => adjustMainSize(2)}>
            A+
          </button>
          <button
            data-testid="settings-gear"
            aria-label="Settings"
            onClick={onOpenSettings}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* Hairline progress */}
      <div className="reader-progress shrink-0" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>

      {/* Stage: trail top, current sentence center, upcoming bottom. */}
      <div className="reader-stage relative min-h-0 flex-1">
        {/* Top zone: already-read sentences of this page, muted, anchored top. */}
        <div className="absolute inset-x-0 top-0">
          <div
            className="mx-auto w-full max-w-[56rem]"
            style={{ padding: "1.25rem max(1.5rem,12%) 0" }}
          >
            <div
              data-testid="trail-block"
              className="trail-block overflow-hidden"
              style={{
                maxHeight: "24vh",
                maskImage:
                  "linear-gradient(to bottom, black 55%, transparent 98%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 55%, transparent 98%)",
              }}
            >
              {trail.map((s) => (
                <TrailLine
                  key={s.id}
                  s={s}
                  mark={markOf(s.id)}
                  upcoming={false}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Center: the ONE current sentence. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-full max-w-[56rem]"
            style={{ padding: "0 max(1.5rem,12%)" }}
          >
            {current ? (
              <div
                key={current.id}
                data-testid="current-sentence"
                className={
                  "current-sentence w-full" +
                  (current.kind === "heading" ? " cur-heading" : "")
                }
                style={
                  current.kind === "heading"
                    ? undefined
                    : {
                        fontSize: `${currentFontPx(current.text, settings.mainSize)}px`,
                      }
                }
              >
                {current.kind === "bullet" ? (
                  <div
                    className="bullet-wrap"
                    style={{ marginLeft: current.level * 18 }}
                  >
                    <SentenceText s={current} mark={currentMark} />
                  </div>
                ) : (
                  <SentenceText s={current} mark={currentMark} />
                )}
              </div>
            ) : (
              <p className="text-white/40 text-sm">This page has no text.</p>
            )}
          </div>
        </div>

        {/* Bottom zone: upcoming sentences of this page, muted, anchored bottom. */}
        <div className="absolute inset-x-0 bottom-0">
          <div
            className="mx-auto w-full max-w-[56rem]"
            style={{ padding: "0 max(1.5rem,12%) 1.5rem" }}
          >
            <div
              data-testid="upcoming-block"
              className="trail-block overflow-hidden"
              style={{
                maxHeight: "20vh",
                maskImage:
                  "linear-gradient(to top, black 55%, transparent 98%)",
                WebkitMaskImage:
                  "linear-gradient(to top, black 55%, transparent 98%)",
              }}
            >
              {upcoming.map((s) => (
                <TrailLine
                  key={s.id}
                  s={s}
                  mark={markOf(s.id)}
                  upcoming={true}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Auto-hiding bottom nav: prev section / prev page / next page / next section */}
      <nav
        data-bottom-nav
        data-testid="bottom-nav"
        className={`bottom-nav${barVisible ? " show" : ""}`}
        aria-label="Page navigation"
        onFocus={() => showBar()}
      >
        <button
          data-testid="nav-prev-section"
          onClick={gotoPrevSection}
          aria-label="Previous section"
        >
          «
        </button>
        <button
          data-testid="nav-prev-page"
          onClick={() => gotoPage(pos.page - 1, 0)}
          aria-label="Previous page"
        >
          ‹
        </button>
        <button
          data-testid="nav-next-page"
          onClick={() => gotoPage(pos.page + 1, 0)}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          data-testid="nav-next-section"
          onClick={gotoNextSection}
          aria-label="Next section"
        >
          »
        </button>
      </nav>

      {/* One-card action popup (middle-third tap on the current sentence) */}
      {popupOpen && (
        <div
          className="sheet-backdrop"
          data-testid="action-popup"
          onClick={closePopup}
        >
          <div
            data-testid="popup-card"
            className="sheet-card action-card flex flex-col gap-2"
            style={{ padding: 12 }}
            role="dialog"
            aria-label="Sentence actions"
            onClick={(e) => e.stopPropagation()}
          >
            {popupRows.map((r) => (
              <button
                key={r.key}
                data-testid={r.testid}
                onClick={r.onClick}
                className="action-row flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-medium text-foreground"
                style={
                  r.active
                    ? r.activeStyle
                    : {
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                      }
                }
              >
                {r.icon}
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Jump sheet: type the page */}
      {jumpOpen && (
        <div
          className="sheet-backdrop"
          data-testid="jump-sheet"
          onClick={closeJump}
        >
          <div
            className="sheet-card"
            role="dialog"
            aria-label="Go to page"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-center text-lg font-semibold text-foreground">
              Go to page
            </h2>
            <div className="mt-4 flex items-center justify-center gap-3">
              <input
                data-testid="jump-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                value={jumpVal}
                onChange={(e) => {
                  setJumpVal(e.target.value);
                  setJumpHint(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitJump();
                }}
                className="jump-input"
                aria-label="Page number"
              />
              <span className="text-sm text-muted-foreground">
                of {totalPages} pages
              </span>
            </div>
            {jumpHint && (
              <p
                data-testid="jump-hint"
                className="mt-2 text-center text-xs text-muted-foreground"
              >
                {jumpHint}
              </p>
            )}
            <button
              data-testid="jump-go"
              onClick={submitJump}
              className="mt-4 block w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              Go to page
            </button>

            {sectionPages.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Sections
                </p>
                <div className="mt-1 max-h-[22vh] overflow-auto">
                  {sectionPages.map((i) => (
                    <button
                      key={i}
                      data-testid={`jump-section-${i}`}
                      onClick={() => gotoPage(i, 0)}
                      className="block w-full border-b border-border py-2.5 text-left"
                    >
                      <span className="block text-sm font-medium text-foreground">
                        {book.pages[i].sentences[0]?.text}
                      </span>
                      <small className="text-muted-foreground">
                        Page {i + 1}
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {bookmarkList.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Bookmarks
                </p>
                <div className="max-h-[22vh] overflow-auto">
                  {bookmarkList.map((b) => (
                    <button
                      key={b.id}
                      data-testid={`jump-bookmark-${b.page}-${b.sent}`}
                      onClick={() => gotoPage(b.page, b.sent)}
                      className="block w-full border-b border-border py-2.5 text-left"
                    >
                      <span className="block text-sm text-foreground">
                        <span className="bm-dot !ml-0 !mr-2" aria-hidden />
                        {b.text.length > 90
                          ? b.text.slice(0, 90) + "…"
                          : b.text}
                      </span>
                      <small className="text-muted-foreground">
                        Page {b.page + 1}
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
