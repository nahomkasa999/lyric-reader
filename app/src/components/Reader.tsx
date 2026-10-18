import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookDoc, Position, Sentence } from "../lib/types";
import {
  progressOf,
  step,
  trailSentences,
  upcomingSentences,
} from "../lib/types";
import { getBook, getProgress, saveProgress } from "../lib/db";

interface Props {
  bookId: string;
  onBack: () => void;
}

const FONT_SCALE_KEY = "lyric-reader.font-scale";
const WHEEL_LOCK_MS = 600;
const WHEEL_THRESHOLD = 20;
const SWIPE_THRESHOLD = 48;
const TAP_SLOP = 12;
const OVERLAY_HIDE_MS = 3500;

/** Shrink very long sentences so they fit without scrolling. */
function currentFontSize(text: string, scale: number): string {
  const len = text.length;
  const rem = len <= 90 ? 2.6 : len <= 170 ? 2.1 : len <= 280 ? 1.7 : 1.4;
  return `${(rem * scale).toFixed(2)}rem`;
}

function readFontScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(FONT_SCALE_KEY) ?? "1");
    return Number.isFinite(v) ? Math.min(1.4, Math.max(0.8, v)) : 1;
  } catch {
    return 1;
  }
}

function TrailLine({ s }: { s: Sentence }) {
  if (s.kind === "bullet") {
    return (
      <div
        className="flex"
        style={{ paddingLeft: s.level * 10 }}
      >
        <span className="mr-2 shrink-0 opacity-70">•</span>
        <span>{s.text}</span>
      </div>
    );
  }
  if (s.kind === "heading") {
    return <div className="font-medium">{s.text}</div>;
  }
  return <span>{s.text} </span>;
}

export default function Reader({ bookId, onBack }: Props) {
  const [book, setBook] = useState<BookDoc | null>(null);
  const [pos, setPos] = useState<Position>({ page: 0, sent: 0 });
  const [overlay, setOverlay] = useState(false);
  const [fontScale, setFontScale] = useState(readFontScale);
  const [failed, setFailed] = useState(false);

  const wheelLock = useRef(0);
  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const overlayTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await getBook(bookId);
      if (!b) {
        setFailed(true);
        return;
      }
      const saved = await getProgress(bookId);
      if (cancelled) return;
      setBook(b);
      if (saved) {
        const page = Math.min(saved.page, b.pages.length - 1);
        const sent = Math.min(
          saved.sent,
          Math.max(0, (b.pages[page]?.sentences.length ?? 1) - 1),
        );
        setPos({ page: Math.max(0, page), sent: Math.max(0, sent) });
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

  const advance = useCallback(
    (dir: 1 | -1) => {
      if (!book) return;
      // Functional update => exactly one step per gesture, no races.
      setPos((p) => step(book.pages, p, dir));
      pokeOverlay(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book],
  );

  const pokeOverlay = useCallback((show?: boolean) => {
    if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
    setOverlay((o) => (show === undefined ? o : show));
    if (show) {
      overlayTimer.current = window.setTimeout(
        () => setOverlay(false),
        OVERLAY_HIDE_MS,
      );
    }
  }, []);

  const toggleOverlay = useCallback(() => {
    setOverlay((o) => {
      const next = !o;
      if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
      if (next) {
        overlayTimer.current = window.setTimeout(
          () => setOverlay(false),
          OVERLAY_HIDE_MS,
        );
      }
      return next;
    });
  }, []);

  // Keyboard: arrows / space / page keys. One keypress = one sentence.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        pokeOverlay(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, pokeOverlay]);

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
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const dt = performance.now() - s.t;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (Math.max(adx, ady) < TAP_SLOP && dt < 400) {
        // Tap: top third = back, bottom third = forward, middle = overlay.
        const h = window.innerHeight;
        const y = e.clientY;
        if (y < h / 3) advance(-1);
        else if (y > (2 * h) / 3) advance(1);
        else toggleOverlay();
        return;
      }
      if (ady > SWIPE_THRESHOLD && ady > adx * 1.2) {
        advance(dy < 0 ? 1 : -1);
      }
    },
    [advance, toggleOverlay],
  );

  const setScale = useCallback((next: number) => {
    const v = Math.min(1.4, Math.max(0.8, Math.round(next * 10) / 10));
    setFontScale(v);
    try {
      localStorage.setItem(FONT_SCALE_KEY, String(v));
    } catch {
      /* ignore */
    }
    pokeOverlay(true);
  }, [pokeOverlay]);

  const page = book?.pages[pos.page];
  const sentences = page?.sentences ?? [];
  const current: Sentence | undefined = sentences[pos.sent];
  const trail = useMemo(
    () => (book ? trailSentences(book.pages, pos) : []),
    [book, pos],
  );
  const upcoming = useMemo(
    () => (book ? upcomingSentences(book.pages, pos) : []),
    [book, pos],
  );
  const pct = book ? Math.round(progressOf(book, pos) * 100) : 0;

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

  return (
    <div
      data-testid="reader-root"
      className="reader-root fixed inset-0 overflow-hidden"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {/* Top zone: already-read sentences of this page, muted, anchored top. */}
      <div className="absolute inset-x-0 top-0">
        <div
          className="mx-auto w-full max-w-[56rem]"
          style={{
            padding: `max(3.25rem, env(safe-area-inset-top)) max(1.5rem,12%) 0`,
          }}
        >
          <div
            data-testid="trail-block"
            className="trail-block overflow-hidden"
            style={{
              maxHeight: "24vh",
              maskImage: "linear-gradient(to bottom, black 55%, transparent 98%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 55%, transparent 98%)",
            }}
          >
            {trail.map((s) => (
              <TrailLine key={s.id} s={s} />
            ))}
          </div>
        </div>
      </div>

      {/* Center: the ONE current sentence. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full max-w-[56rem]" style={{ padding: "0 max(1.5rem,12%)" }}>
          {current ? (
          <div
            key={current.id}
            data-testid="current-sentence"
            className="current-sentence w-full"
            style={{ fontSize: currentFontSize(current.text, fontScale) }}
          >
            {current.kind === "bullet" ? (
              <div
                className="relative"
                style={{ paddingLeft: 14 + current.level * 18 }}
              >
                {current.level > 0 && (
                  <div
                    className="bullet-hairline absolute top-1 bottom-1"
                    style={{ left: current.level * 18 }}
                    aria-hidden
                  />
                )}
                <p>{current.text}</p>
              </div>
            ) : current.kind === "heading" ? (
              <p style={{ fontFamily: "var(--font-serif)" }}>{current.text}</p>
            ) : (
              <p>{current.text}</p>
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
          style={{
            padding: `0 max(1.5rem,12%) max(2.75rem, env(safe-area-inset-bottom))`,
          }}
        >
          <div
            data-testid="upcoming-block"
            className="trail-block overflow-hidden"
            style={{
              maxHeight: "20vh",
              maskImage: "linear-gradient(to top, black 55%, transparent 98%)",
              WebkitMaskImage:
                "linear-gradient(to top, black 55%, transparent 98%)",
            }}
          >
            {upcoming.map((s) => (
              <TrailLine key={s.id} s={s} />
            ))}
          </div>
        </div>
      </div>

      {/* Hidden-until-tapped overlay: back, position, font size. */}
      {overlay && (
        <div
          data-testid="reader-overlay"
          className="absolute inset-x-0 top-0 z-10"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="bg-black/70 backdrop-blur-md border-b border-white/10">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                data-testid="overlay-back"
                onClick={onBack}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/90"
              >
                ← Library
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {book.title}
                </p>
                <p className="text-xs text-white/50">
                  <span data-testid="page-label">
                    Page {pos.page + 1} of {book.pages.length}
                  </span>
                  {" · "}
                  <span data-testid="progress-label">{pct}%</span>
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  aria-label="Smaller text"
                  onClick={() => setScale(fontScale - 0.1)}
                  className="rounded-lg border border-white/15 px-2.5 py-1.5 text-sm text-white/90"
                >
                  A−
                </button>
                <button
                  aria-label="Larger text"
                  onClick={() => setScale(fontScale + 0.1)}
                  className="rounded-lg border border-white/15 px-2.5 py-1.5 text-sm text-white/90"
                >
                  A+
                </button>
              </div>
            </div>
            <div className="h-0.5 bg-white/10">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
