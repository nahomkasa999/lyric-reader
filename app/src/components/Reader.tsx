// Reader v3: the user's own reader mechanics, faithfully ported.
// Item stream + per-part stepping (lib/parts.ts splitS), a translating
// track that centres the current item (or current part), click-first input,
// the action popup anchored at the sentence with the .fx focus effect,
// and an inline editable page number in the top bar.
// Extraction stays ours (lib/extract.ts); settings stay on their own page.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { BookDoc, Item, Position } from "../lib/types";
import { migratePosition, stepParts } from "../lib/types";
import { splitS } from "../lib/parts";
import {
  getBook,
  getMarks,
  getProgress,
  saveProgress,
  setNote,
  toggleMark,
} from "../lib/db";
import { useSettings } from "../lib/settings";

interface Props {
  bookId: string;
  onBack: () => void;
  onOpenSettings: () => void;
  onOpenSaved: () => void;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

interface Mark {
  highlight: boolean;
  bookmark: boolean;
  note: string | null;
}
const NO_MARK: Mark = { highlight: false, bookmark: false, note: null };

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
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M9 11l7-7 4 4-7 7z" />
      <path d="M9 11l-5 5v4h4l5-5" />
    </svg>
  );
}
function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </svg>
  );
}
function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function SavedIcon() {
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
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

export default function Reader({ bookId, onBack, onOpenSettings, onOpenSaved }: Props) {
  const [book, setBook] = useState<BookDoc | null>(null);
  const [pos, setPos] = useState<Position>({ item: 0, part: 0 });
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [failed, setFailed] = useState(false);
  // Action popup: which part it targets (null = closed).
  const [pop, setPop] = useState<{ i: number; p: number } | null>(null);
  const [copied, setCopied] = useState(false);
  // One shared visibility state for ALL chrome: top bar + progress + bottom
  // nav. Default = hidden while reading (v3.1: the user's "full focus" ask).
  const [chromeVisible, setChromeVisible] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  // Inline page-number editing.
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("1");

  const { settings, update: updateSettings } = useSettings();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Refs mirroring state so native handlers always see fresh values.
  const posRef = useRef(pos);
  posRef.current = pos;
  const popRef = useRef(pop);
  popRef.current = pop;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  // Set when Escape cancels the edit so the blur it triggers doesn't commit.
  const cancelEditRef = useRef(false);
  const lastTap = useRef<{ t: number; key: string }>({ t: 0, key: "" });
  const moved = useRef(false);
  const chromeTimer = useRef<number | null>(null);
  const chromeRef = useRef(false);

  const items: Item[] = book?.items ?? [];
  // Parts per item (his splitS), cached per book.
  const parts = useMemo(() => items.map((it) => splitS(it.text)), [items]);
  const partsRef = useRef<string[][]>([]);
  partsRef.current = parts;

  const I = pos.item;
  const P = pos.part;
  const curPage = items[I]?.page ?? 0;
  const pages = items.length ? items[items.length - 1].page + 1 : 0;
  const cp = curPage + 1;
  const pct = items.length
    ? Math.round((I / Math.max(1, items.length - 1)) * 100)
    : 0;

  // Keep the edit field in sync with the real page when not editing.
  useEffect(() => {
    if (!editing) setEditVal(String(cp));
  }, [cp, editing]);

  // --- Load: book + saved position (old {page,sent} records convert) ---
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
      // First open: flash the chrome briefly so the user sees where
      // everything is, then it hides itself for full-focus reading.
      showChromeRef.current(1600);
      if (saved) {
        const m = migratePosition(b.items, saved);
        const pl = splitS(b.items[m.item]?.text ?? "");
        setPos({
          item: m.item,
          part: Math.min(m.part, Math.max(0, pl.length - 1)),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // --- Persist position (debounced) + flush on pagehide ---
  const posSaveRef = useRef(pos);
  posSaveRef.current = pos;
  useEffect(() => {
    if (!book) return;
    const t = window.setTimeout(() => {
      saveProgress(bookId, posSaveRef.current).catch(() => {});
    }, 500);
    const flush = () => {
      saveProgress(bookId, posSaveRef.current).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pagehide", flush);
    };
  }, [book, bookId, pos]);

  // --- Unified chrome show/hide (v3.1): top bar + progress + bottom nav
  // share one state and one idle timer. Hidden = opacity 0 + slide +
  // visibility:hidden + no pointer events (an opacity-0 bar must never
  // intercept taps — that bug bit us in v2). Never hides while the page
  // input is being edited: the timer re-arms instead.
  const showChrome = useCallback((ms = 2500) => {
    chromeRef.current = true;
    setChromeVisible(true);
    if (chromeTimer.current) window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => {
      if (editingRef.current) {
        showChrome(2500);
        return;
      }
      chromeRef.current = false;
      setChromeVisible(false);
    }, ms);
  }, []);
  const hideChrome = useCallback(() => {
    if (chromeTimer.current) window.clearTimeout(chromeTimer.current);
    chromeRef.current = false;
    setChromeVisible(false);
  }, []);
  const showChromeRef = useRef(showChrome);
  showChromeRef.current = showChrome;
  useEffect(
    () => () => {
      if (chromeTimer.current) window.clearTimeout(chromeTimer.current);
    },
    [],
  );

  // --- Core moves ---
  const closePop = useCallback(() => {
    popRef.current = null;
    setPop(null);
    setCopied(false);
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      closePop();
      setPos((p) => stepParts(partsRef.current, p, dir));
    },
    [closePop],
  );
  const goRef = useRef(go);
  goRef.current = go;

  const toPage = useCallback(
    (p: number) => {
      if (!pages) return;
      const t = clamp(p, 0, pages - 1);
      const idx = items.findIndex((it) => it.page === t);
      if (idx < 0) return;
      closePop();
      setPos({ item: idx, part: 0 });
      showChrome(1200);
    },
    [pages, items, closePop, showChrome],
  );
  const toPageRef = useRef(toPage);
  toPageRef.current = toPage;

  /** «/»: nearest heading item before/after the current one (his chap). */
  const chap = useCallback(
    (d: 1 | -1) => {
      const { item: cur } = posRef.current;
      let t = -1;
      if (d > 0) {
        t = items.findIndex((x, i) => i > cur && x.kind === "heading");
      } else {
        for (let i = cur - 1; i >= 0; i--) {
          if (items[i].kind === "heading") {
            t = i;
            break;
          }
        }
        if (t < 0) t = 0;
      }
      if (t < 0) return;
      closePop();
      setPos({ item: t, part: 0 });
      showChrome(1200);
    },
    [items, closePop, showChrome],
  );

  // Briefly reveal the bar on every page change.
  const prevPageRef = useRef(curPage);
  useEffect(() => {
    if (prevPageRef.current !== curPage) {
      prevPageRef.current = curPage;
      showChrome(1200);
    }
  }, [curPage, showChrome]);

  // --- Track placement (his place()): centre the current item; if it has
  // more than one part and is taller than half the stage, centre the
  // current part instead. ---
  const place = useCallback(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track) return;
    const el = track.querySelector<HTMLElement>(
      `[data-item="${posRef.current.item}"]`,
    );
    if (!el) return;
    let t: HTMLElement = el;
    let o = 0;
    if (
      el.children.length > 1 &&
      el.offsetHeight > stage.clientHeight * 0.5
    ) {
      const c = el.children[posRef.current.part] as HTMLElement | undefined;
      if (c) {
        t = c;
        o = c.offsetTop;
      }
    }
    const y =
      stage.clientHeight / 2 - (el.offsetTop + o + t.offsetHeight / 2);
    track.style.transform = `translateY(${y}px)`;
  }, []);

  useLayoutEffect(() => {
    place();
  }, [place, I, P, curPage, book, settings]);

  useEffect(() => {
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  // --- Action popup, anchored at the item (his openPop positioning) ---
  const openPop = useCallback((i: number, p: number) => {
    setPop({ i, p });
    setCopied(false);
    setNoteEditing(false);
    setNoteDraft("");
    requestAnimationFrame(() => {
      const track = trackRef.current;
      const m = menuRef.current;
      if (!track || !m) return;
      const el = track.querySelector<HTMLElement>(`[data-item="${i}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const mh = m.offsetHeight;
      const mw = m.offsetWidth;
      let top = r.bottom + 16;
      if (top + mh > window.innerHeight - 16)
        top = Math.max(16, r.top - mh - 16);
      m.style.top = `${top}px`;
      m.style.left = `${Math.max(
        16,
        Math.min(window.innerWidth - mw - 24, r.right - mw),
      )}px`;
    });
  }, []);

  // --- Input: wheel / keys / swipe / click (his exact semantics) ---
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let wlock = false;
    let wt = 0;
    let ty = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      window.clearTimeout(wt);
      wt = window.setTimeout(() => {
        wlock = false;
      }, 200);
      if (wlock || Math.abs(e.deltaY) < 4) return;
      wlock = true;
      goRef.current(e.deltaY > 0 ? 1 : -1);
    };

    const onTouchStart = (e: TouchEvent) => {
      ty = e.touches[0].clientY;
      moved.current = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (moved.current) return;
      const dy = ty - e.touches[0].clientY;
      if (Math.abs(dy) > 30) {
        goRef.current(dy > 0 ? 1 : -1);
        moved.current = true;
      }
    };

    const onClick = (e: MouseEvent) => {
      if (moved.current) {
        moved.current = false;
        return;
      }
      const t = e.target as HTMLElement;
      // Hot zones: taps at the top ~12% or bottom 15% of the stage reveal
      // the chrome (unified, v3.1) instead of stepping — never advance here.
      const stageRect = stage.getBoundingClientRect();
      if (e.clientY - stageRect.top < stageRect.height * 0.12) {
        showChrome();
        return;
      }
      // Bottom hot-zone: reveal the chrome instead of stepping.
      if (e.clientY > window.innerHeight * 0.85) {
        showChrome();
        return;
      }
      const s = t.closest("[data-item]");
      if (!s) return;
      const i = Number(s.getAttribute("data-item"));
      const cur = posRef.current;
      const pl = partsRef.current;
      if (i !== cur.item) {
        // Adjacent item: jump to it (forward = part 0, back = last part).
        if (Math.abs(i - cur.item) === 1) {
          const fwd = i > cur.item;
          closePop();
          setPos({ item: i, part: fwd ? 0 : pl[i].length - 1 });
        }
        return;
      }
      const sp = t.closest("[data-p]");
      const p = sp ? Number(sp.getAttribute("data-p")) : cur.part;
      const key = `${cur.item}:${cur.part}`;
      const now = Date.now();
      if (p !== cur.part) {
        // Click the muted half of a split sentence: activate that half.
        setPos({ item: cur.item, part: p });
        lastTap.current = { t: now, key: `${cur.item}:${p}` };
        return;
      }
      // Double-tap the active part — or any tap on a single-part
      // sentence — opens the action popup.
      if (
        pl[cur.item].length === 1 ||
        (now - lastTap.current.t < 350 && lastTap.current.key === key)
      ) {
        openPop(cur.item, cur.part);
        lastTap.current.t = 0;
      } else {
        lastTap.current = { t: now, key };
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (popRef.current) {
        if (e.key === "Escape") closePop();
        return;
      }
      if (editingRef.current) return; // the page field owns its keys
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowRight" ||
        e.key === " " ||
        e.key === "PageDown"
      ) {
        e.preventDefault();
        goRef.current(1);
      } else if (
        e.key === "ArrowUp" ||
        e.key === "ArrowLeft" ||
        e.key === "PageUp"
      ) {
        e.preventDefault();
        goRef.current(-1);
      } else if (e.key === "Escape") {
        hideChrome();
      }
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchmove", onTouchMove, { passive: true });
    stage.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
    // `book` in deps: the effect must (re-)attach once the stage exists
    // after the book loads — on first render we bail out at `!stage`.
  }, [book, closePop, openPop, showChrome, hideChrome]);

  // A− / A+ adjust the same main-size setting the slider edits.
  const adjustMainSize = useCallback(
    (delta: number) => {
      updateSettings({
        mainSize: clamp(Math.round(settings.mainSize + delta), 18, 48),
      });
    },
    [settings.mainSize, updateSettings],
  );

  // --- Popup actions (act on the current PART, persisted per book) ---
  const popKey = pop ? `${pop.i}:${pop.p}` : "";
  const popMark: Mark = (popKey && marks[popKey]) || NO_MARK;

  const toggleMarkKind = useCallback(
    async (kind: "highlight" | "bookmark") => {
      const p = popRef.current;
      if (!p) return;
      try {
        const m = await toggleMark(bookId, `${p.i}:${p.p}`, kind);
        setMarks((prev) => ({ ...prev, [`${p.i}:${p.p}`]: m }));
      } catch {
        /* ignore */
      }
    },
    [bookId],
  );

  const saveNote = useCallback(async () => {
    const p = popRef.current;
    if (!p) return;
    try {
      const m = await setNote(bookId, `${p.i}:${p.p}`, noteDraftRef.current);
      setMarks((prev) => ({ ...prev, [`${p.i}:${p.p}`]: m }));
      setNoteEditing(false);
    } catch {
      /* ignore */
    }
  }, [bookId]);

  const deleteNote = useCallback(async () => {
    const p = popRef.current;
    if (!p) return;
    try {
      const m = await setNote(bookId, `${p.i}:${p.p}`, null);
      setMarks((prev) => ({ ...prev, [`${p.i}:${p.p}`]: m }));
      setNoteEditing(false);
    } catch {
      /* ignore */
    }
  }, [bookId]);

  const doCopy = useCallback(async () => {
    const p = popRef.current;
    if (!p) return;
    const text = partsRef.current[p.i]?.[p.p] ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, []);

  const noteDraftRef = useRef(noteDraft);
  noteDraftRef.current = noteDraft;

  const markOf = useCallback((key: string): Mark => marks[key] ?? NO_MARK, [marks]);

  // Items on the current page only (his buildPage: the track holds one page).
  const pageItems = useMemo(() => {
    const out: { idx: number; item: Item; parts: string[] }[] = [];
    items.forEach((item, idx) => {
      if (item.page === curPage) out.push({ idx, item, parts: parts[idx] });
    });
    return out;
  }, [items, curPage, parts]);

  const rows = [
    {
      key: "bookmark" as const,
      label: "Bookmark",
      testid: "popup-bookmark",
      icon: <BookmarkIcon />,
      active: popMark.bookmark,
      activeStyle: {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
      },
      onClick: () => toggleMarkKind("bookmark"),
    },
    {
      key: "highlight" as const,
      label: "Highlight",
      testid: "popup-highlight",
      icon: <HighlightIcon />,
      active: popMark.highlight,
      activeStyle: { background: "var(--lr-hl)", color: "#000" },
      onClick: () => toggleMarkKind("highlight"),
    },
    {
      key: "note" as const,
      label: popMark.note ? "Edit note" : "Note",
      testid: "popup-note",
      icon: <NoteIcon />,
      active: !!popMark.note,
      activeStyle: {
        background: "var(--accent)",
        color: "var(--foreground)",
      },
      onClick: () => {
        setNoteDraft(popMark.note ?? "");
        setNoteEditing(true);
      },
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

  if (!book || !items.length) {
    return (
      <div className="reader-root fixed inset-0 flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div
      data-testid="reader-root"
      className={`reader-root fixed inset-0 flex flex-col overflow-hidden${pop ? " fx" : ""}`}
      onMouseMove={(e) => {
        // Desktop: hovering near the top or bottom edge reveals the chrome.
        const r = stageRef.current?.getBoundingClientRect();
        const nearTop = r ? e.clientY - r.top < r.height * 0.12 : false;
        const nearBottom = e.clientY > window.innerHeight * 0.85;
        if ((nearTop || nearBottom) && !chromeRef.current) showChrome();
      }}
    >
      {/* Top bar: library | Page [n] / N · pct% | A− A+ gear.
          Hides with the rest of the chrome (v3.1) but keeps its layout
          space so the stage never resizes and the track never jumps. */}
      <header
        data-topbar
        data-testid="top-bar"
        className={`reader-bar shrink-0${chromeVisible ? "" : " chrome-hidden"}`}
        style={{ paddingTop: "calc(10px + env(safe-area-inset-top))" }}
        onFocus={() => showChrome()}
        onPointerDown={() => showChrome()}
      >
        <button onClick={onBack} aria-label="Back to library">
          ← Library
        </button>
        <span className="page-label" data-testid="page-label">
          Page
          <input
            data-testid="page-input"
            className="page-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Page number"
            value={editVal}
            onFocus={(e) => {
              setEditing(true);
              e.target.select();
            }}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={() => {
              if (cancelEditRef.current) {
                cancelEditRef.current = false;
                return;
              }
              const v = parseInt(editVal, 10);
              if (Number.isFinite(v)) toPageRef.current(clamp(v, 1, pages) - 1);
              else setEditVal(String(cp));
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              else if (e.key === "Escape") {
                cancelEditRef.current = true;
                setEditVal(String(cp));
                setEditing(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          / {pages} · {pct}%
        </span>
        <div className="flex items-center">
          <button aria-label="Smaller text" onClick={() => adjustMainSize(-2)}>
            A−
          </button>
          <button aria-label="Larger text" onClick={() => adjustMainSize(2)}>
            A+
          </button>
          <button
            data-testid="saved-btn"
            aria-label="Saved marks"
            onClick={onOpenSaved}
          >
            <SavedIcon />
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

      {/* Hairline progress: visible with the chrome only (v3.1) */}
      <div
        data-testid="reader-progress"
        className={`reader-progress shrink-0${chromeVisible ? "" : " chrome-hidden"}`}
        aria-hidden
      >
        <i style={{ width: `${pct}%` }} />
      </div>

      {/* Stage: his translating track, masked at the edges. */}
      <div ref={stageRef} data-testid="stage" className="reader-stage min-h-0 flex-1">
        <div ref={trackRef} data-testid="track" className="reader-track">
          {pageItems.map(({ idx, item, parts: ps }) => {
            const isCur = idx === I;
            const cls =
              "s" +
              (item.kind === "heading" ? " h" : item.kind === "bullet" ? " li" : "") +
              (isCur ? " cur" : idx < I ? " past" : "") +
              (idx > I + 1 || idx < I - 2 ? " far" : "") +
              (item.paraStart && idx > 0 ? " gap" : "");
            return (
              <p
                key={idx}
                data-item={idx}
                data-testid={isCur ? "current-item" : `item-${idx}`}
                className={cls}
                style={
                  item.kind === "bullet"
                    ? { marginLeft: item.depth * 18 }
                    : undefined
                }
              >
                {ps.map((t, p) => {
                  const key = `${idx}:${p}`;
                  const mk = markOf(key);
                  return (
                    <span
                      key={p}
                      data-p={p}
                      data-testid={`part-${idx}-${p}`}
                      className={
                        "pt" +
                        (isCur && p === P ? " on" : "") +
                        (mk.highlight ? " hl" : "") +
                        (mk.bookmark ? " bm" : "") +
                        (mk.note ? " nt" : "")
                      }
                    >
                      {t}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
      </div>

      {/* Auto-hiding bottom nav: « prev heading · ‹ prev page · › next page · » next heading */}
      <nav
        data-bottom-nav
        data-testid="bottom-nav"
        className={`bottom-nav${chromeVisible ? " show" : ""}`}
        aria-label="Page navigation"
        onFocus={() => showChrome()}
        onPointerDown={() => showChrome()}
      >
        <button
          data-testid="nav-prev-section"
          onClick={() => chap(-1)}
          aria-label="Previous section"
        >
          «
        </button>
        <button
          data-testid="nav-prev-page"
          onClick={() => toPage(curPage - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>
        <button
          data-testid="nav-next-page"
          onClick={() => toPage(curPage + 1)}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          data-testid="nav-next-section"
          onClick={() => chap(1)}
          aria-label="Next section"
        >
          »
        </button>
      </nav>

      {/* Action popup: one card anchored at the sentence, staggered rows. */}
      {pop && (
        <div className="pop-layer" data-testid="action-popup">
          <div
            ref={menuRef}
            data-testid="popup-card"
            className="menu"
            role="dialog"
            aria-label="Sentence actions"
          >
            {noteEditing ? (
              <div className="note-editor" data-testid="note-editor">
                <textarea
                  data-testid="note-textarea"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Write a note on this part…"
                  rows={4}
                  autoFocus
                  className="note-textarea"
                  aria-label="Note text"
                />
                <div className="note-editor-actions">
                  {popMark.note && (
                    <button
                      data-testid="note-delete"
                      onClick={deleteNote}
                      className="note-btn danger"
                    >
                      Delete
                    </button>
                  )}
                  <span className="flex-1" />
                  <button
                    data-testid="note-cancel"
                    onClick={() => setNoteEditing(false)}
                    className="note-btn"
                  >
                    Cancel
                  </button>
                  <button
                    data-testid="note-save"
                    onClick={saveNote}
                    className="note-btn primary"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              rows.map((r) => (
                <button
                  key={r.key}
                  data-testid={r.testid}
                  onClick={r.onClick}
                  className="action-row"
                  style={r.active ? r.activeStyle : undefined}
                >
                  {r.icon}
                  <span>{r.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
