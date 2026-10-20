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
  listVocab,
  saveProgress,
  saveVocab,
  setNote,
  toggleMark,
  type VocabRecord,
} from "../lib/db";
import { useSettings } from "../lib/settings";
import { getEffectiveApiKey } from "../lib/apikey";
import {
  highlightsSupported,
  wordRangeAt,
  extendSelection,
  paintSelection,
} from "../lib/selection";
import {
  geminiInContext,
  lookupMeaning,
  type MeaningModel,
} from "../lib/meaning";
import { decorateText } from "../lib/vocab";
import {
  nextAutoStep,
  nextSpeed,
  paceMs,
} from "../lib/autoscroll";
import { speak, speechSupported, stopSpeech } from "../lib/speech";
import AskSheet from "./AskSheet";

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

// Meaning card state (v4).
type MeaningStatus =
  | "loading"
  | "ready"
  | "not-found"
  | "needs-key"
  | "offline"
  | "error";
interface MeaningState {
  /** text as the user selected it */
  text: string;
  status: MeaningStatus;
  model?: MeaningModel;
  saved: boolean;
  /** for phrases without a key */
  query?: string;
}

// Cache of AI "as used in this sentence" lines: norm + sentence head -> line.
const contextCache = new Map<string, string>();

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

// v4.4: auto-scroll play/pause — same stroke language as the app's icons.
function PlayIcon() {
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
      <path d="M7.5 4.8v14.4L19 12z" />
    </svg>
  );
}
function PauseIcon() {
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
      <path d="M8.5 5v14M15.5 5v14" />
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
  // v4: text selection (pill) + meaning card + saved words + Ask.
  const [sel, setSel] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const [meaning, setMeaning] = useState<MeaningState | null>(null);
  const [vocab, setVocab] = useState<VocabRecord[]>([]);
  const [askOpen, setAskOpen] = useState(false);
  // v4.4: auto-scroll (auto-advance) + speed flash label.
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [speedFlash, setSpeedFlash] = useState<string | null>(null);
  // v4.7: the header overflow menu (text size, saved, settings).
  const [menuOpen, setMenuOpen] = useState(false);
  // v4.7: read aloud — is the voice talking right now?
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = useMemo(() => speechSupported(), []);

  const { settings, update: updateSettings } = useSettings();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);  const meaningCardRef = useRef<HTMLDivElement | null>(null);
  const askLayerRef = useRef<HTMLDivElement | null>(null);

  // Refs mirroring state so native handlers always see fresh values.
  const posRef = useRef(pos);
  posRef.current = pos;
  const popRef = useRef(pop);
  popRef.current = pop;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const selRef = useRef(sel);
  selRef.current = sel;
  const meaningRef = useRef(meaning);
  meaningRef.current = meaning;
  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;
  const askOpenRef = useRef(askOpen);
  askOpenRef.current = askOpen;
  // v4.7: the overflow menu — the chrome must not auto-hide under it.
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;
  const bookRef = useRef<BookDoc | null>(null);
  const itemsRef = useRef<Item[]>([]);
  // v4.4: auto-scroll refs. autoTimer is the SINGLE playback timeout —
  // always cleared before re-arming, so rapid toggles can't stack timers.
  const autoPlayingRef = useRef(autoPlaying);
  autoPlayingRef.current = autoPlaying;
  const autoTimer = useRef<number | null>(null);
  // True when playback was paused for a transient overlay (popup,
  // selection, meaning card, Ask sheet) and should resume on close.
  // Leaving the reader / Settings / tab-hide clears it (stay paused).
  const autoResumeRef = useRef(false);
  const speedRef = useRef(settings.autoScrollSpeed);
  speedRef.current = settings.autoScrollSpeed;
  const speedFlashTimer = useRef<number | null>(null);
  // Long-press on the auto-scroll button (speed cycle) vs tap (toggle).
  const autoLpRef = useRef<{ timer: number; x: number; y: number } | null>(
    null,
  );
  const autoLpFiredRef = useRef(false);
  // Set when Escape cancels the edit so the blur it triggers doesn't commit.
  const cancelEditRef = useRef(false);
  const lastTap = useRef<{ t: number; key: string }>({ t: 0, key: "" });
  const moved = useRef(false);
  // Timestamp until which stage/chrome clicks are ignored, set when a
  // tap-outside popup dismissal swallows the pointerdown (the click that
  // follows it must not trigger anything).
  const suppressUntil = useRef(0);
  const chromeTimer = useRef<number | null>(null);
  const chromeRef = useRef(false);
  // v4.1: custom selection (no native Selection ever — that is what
  // summoned Android's Define/Copy/Select all/Web search toolbar).
  const selRangeRef = useRef<Range | null>(null);
  const lpRef = useRef<{ x: number; y: number; timer: number } | null>(null);
  // While the press keeps dragging (after the long-press fired, or a
  // re-drag started on the painted selection), this anchors the fixed
  // end of the selection; the loose end follows the pointer.
  const extendRef = useRef<{ node: Node; offset: number } | null>(null);
  // Timestamp of the last selection-gesture pointerup: the synthetic click
  // that can follow it must never step or open the popup.
  const lastSelEndRef = useRef(0);

  const items: Item[] = book?.items ?? [];
  itemsRef.current = items;
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
      const savedVocab = await listVocab(bookId).catch(() => []);
      if (cancelled) return;
      setBook(b);
      bookRef.current = b;
      setMarks(savedMarks);
      setVocab(savedVocab);
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
      // v4.7: the overflow menu is open — the bar must stay put.
      if (menuOpenRef.current) {
        showChrome(2500);
        return;
      }
      chromeRef.current = false;
      setChromeVisible(false);
      setMenuOpen(false);
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
    // v4.4: a popup that paused playback gives it back on close.
    maybeResumeAutoRef.current();
  }, []);

  /** v4.1: collapse the custom selection — clear the painted highlight
      (the native Selection is never created, so Android's toolbar can
      never appear) and hide the pill. v4.4: resumes transient-paused
      playback unless told not to (the meaning opener pauses itself). */
  const collapseSelection = useCallback((resume = true) => {
    selRef.current = null;
    setSel(null);
    selRangeRef.current = null;
    extendRef.current = null;
    if (lpRef.current) {
      window.clearTimeout(lpRef.current.timer);
      lpRef.current = null;
    }
    try {
      (
        CSS as unknown as { highlights?: Map<string, unknown> }
      ).highlights?.delete("lr-sel");
    } catch {
      /* ignore */
    }
    if (resume) maybeResumeAutoRef.current();
  }, []);

  /** Paint a range as our selection and raise the Meaning/Copy pill above
      its bounding rect. Works even without paint support (pill still comes
      up; only the visual highlight is skipped). */
  const raiseCustomSelection = useCallback((range: Range | null) => {
    if (!range) {
      collapseSelection();
      return;
    }
    // v4.4: selecting pauses playback transiently — resume on dismiss.
    pauseAutoTransientRef.current();
    selRangeRef.current = range;
    if (highlightsSupported()) paintSelection(range);
    const rect = range.getBoundingClientRect();
    const text = range.toString().trim();
    if (!text) {
      collapseSelection();
      return;
    }
    setSel({
      text,
      top: Math.max(8, rect.top - 60),
      left: clamp(rect.left, 16, window.innerWidth - 190),
    });
  }, [collapseSelection]);

  const closeMeaning = useCallback(() => {
    meaningRef.current = null;
    setMeaning(null);
    // v4.4: the meaning card pauses playback transiently — give it back.
    maybeResumeAutoRef.current();
  }, []);

  /** Anything that moves the reading position closes the reading overlays:
      popup, selection, meaning card (the Ask sheet manages itself). */
  const closeReadingOverlays = useCallback(() => {
    closePop();
    collapseSelection();
    closeMeaning();
  }, [closePop, collapseSelection, closeMeaning]);

  const go = useCallback(
    (dir: 1 | -1) => {
      closeReadingOverlays();
      setPos((p) => stepParts(partsRef.current, p, dir));
    },
    [closeReadingOverlays],
  );
  const goRef = useRef(go);
  goRef.current = go;

  const toPage = useCallback(
    (p: number) => {
      if (!pages) return;
      const t = clamp(p, 0, pages - 1);
      const idx = items.findIndex((it) => it.page === t);
      if (idx < 0) return;
      closeReadingOverlays();
      setPos({ item: idx, part: 0 });
      showChrome(1200);
    },
    [pages, items, closeReadingOverlays, showChrome],
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
      closeReadingOverlays();
      setPos({ item: t, part: 0 });
      showChrome(1200);
    },
    [items, closeReadingOverlays, showChrome],
  );

  // --- v4.4: auto-scroll (auto-advance, part by part) ---
  const clearAutoTimer = useCallback(() => {
    if (autoTimer.current !== null) {
      window.clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
  }, []);

  const autoTick = useCallback(() => {
    autoTimer.current = null;
    if (!autoPlayingRef.current) return;
    // Safety: an overlay that somehow opened without pausing playback
    // must never advance underneath it.
    if (
      popRef.current ||
      selRef.current ||
      meaningRef.current ||
      askOpenRef.current
    )
      return;
    const step = nextAutoStep(partsRef.current, posRef.current);
    if ("end" in step) {
      // End of book: stop, icon back to ▶.
      setAutoPlaying(false);
      return;
    }
    setPos(step.next); // the pos effect below re-arms for the new part
  }, []);
  const autoTickRef = useRef(autoTick);
  autoTickRef.current = autoTick;

  /** Arm (or re-arm) the single playback timer for the current part. */
  const armAuto = useCallback(() => {
    clearAutoTimer();
    const { item, part } = posRef.current;
    const text = partsRef.current[item]?.[part] ?? "";
    autoTimer.current = window.setTimeout(() => {
      autoTickRef.current();
    }, paceMs(text, speedRef.current));
  }, [clearAutoTimer]);

  const startAuto = useCallback(() => {
    if (autoPlayingRef.current) {
      armAuto();
      return;
    }
    closeReadingOverlays();
    autoResumeRef.current = false;
    setAutoPlaying(true);
    // Manners: starting playback hides the chrome — full focus. The
    // standard reveal gestures still reach the pause button.
    hideChrome();
    armAuto();
  }, [armAuto, closeReadingOverlays, hideChrome]);

  const stopAuto = useCallback(() => {
    clearAutoTimer();
    setAutoPlaying(false);
  }, [clearAutoTimer]);

  /** Hard stop: pause with no resume (leaving the reader, Settings, tab). */
  const stopAutoHard = useCallback(() => {
    autoResumeRef.current = false;
    clearAutoTimer();
    setAutoPlaying(false);
  }, [clearAutoTimer]);

  const toggleAuto = useCallback(() => {
    if (autoPlayingRef.current) stopAuto();
    else startAuto();
  }, [startAuto, stopAuto]);
  const toggleAutoRef = useRef(toggleAuto);
  toggleAutoRef.current = toggleAuto;

  /** Transient pause for popup/selection/meaning/Ask: resume on close. */
  const pauseAutoTransient = useCallback(() => {
    if (!autoPlayingRef.current) return;
    clearAutoTimer();
    autoResumeRef.current = true;
    setAutoPlaying(false);
  }, [clearAutoTimer]);

  const maybeResumeAuto = useCallback(() => {
    if (!autoResumeRef.current) return;
    autoResumeRef.current = false;
    setAutoPlaying(true);
    armAuto();
  }, [armAuto]);

  /** Ask sheet close (tap-outside, Esc, ✕, quote jump): resume if transient. */
  const closeAsk = useCallback(() => {
    setAskOpen(false);
    maybeResumeAuto();
  }, [maybeResumeAuto]);
  const closeAskRef = useRef(closeAsk);
  closeAskRef.current = closeAsk;
  // Ref mirrors for callbacks defined before this block in source order.
  const pauseAutoTransientRef = useRef(pauseAutoTransient);
  pauseAutoTransientRef.current = pauseAutoTransient;
  const maybeResumeAutoRef = useRef(maybeResumeAuto);
  maybeResumeAutoRef.current = maybeResumeAuto;

  /** Long-press the auto button: cycle the speed, show the label briefly. */
  const cycleSpeed = useCallback(() => {
    const ns = nextSpeed(speedRef.current);
    updateSettings({ autoScrollSpeed: ns });
    setSpeedFlash(`${ns}×`);
    if (speedFlashTimer.current) window.clearTimeout(speedFlashTimer.current);
    speedFlashTimer.current = window.setTimeout(
      () => setSpeedFlash(null),
      1400,
    );
  }, [updateSettings]);

  // --- v4.7: read aloud ---
  // The voice is the browser's own (lib/speech.ts). The reader only decides
  // WHAT is said: the part that is on screen right now.
  const speechToken = useRef(0);
  const spokenRef = useRef("");
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;

  /** The text of the part that is on screen right now. */
  const currentText = useCallback(() => {
    const { item, part } = posRef.current;
    return partsRef.current[item]?.[part] ?? "";
  }, []);

  /** Stop the voice, right now, with no resume. */
  const stopSpeak = useCallback(() => {
    speechToken.current += 1;
    spokenRef.current = "";
    stopSpeech();
    setSpeaking(false);
  }, []);

  /** Say a text with the voice + speed the user picked. */
  const say = useCallback(
    async (text: string) => {
      if (!canSpeak || !text.trim()) return;
      // Already saying exactly this — don't restart it.
      if (speakingRef.current && spokenRef.current === text) return;
      stopSpeech();
      const token = ++speechToken.current;
      spokenRef.current = text;
      setSpeaking(true);
      try {
        await speak(text, {
          rate: settings.readAloudRate,
          voiceURI: settings.readAloudVoice,
        });
      } catch {
        /* this device has no speech engine */
      }
      if (speechToken.current === token) {
        spokenRef.current = "";
        setSpeaking(false);
      }
    },
    [canSpeak, settings.readAloudRate, settings.readAloudVoice],
  );

  /** Follow along: the sentence you are on is the sentence being read. */
  const resumeSpeech = useCallback(() => {
    if (!settings.readAloud) return;
    if (
      popRef.current ||
      selRef.current ||
      meaningRef.current ||
      askOpenRef.current
    )
      return;
    void say(currentText());
  }, [settings.readAloud, say, currentText]);

  // Read aloud follows the reading position: move to a new sentence and it
  // is spoken. Overlays hold the voice until they close.
  useEffect(() => {
    if (!settings.readAloud) {
      stopSpeak();
      return;
    }
    resumeSpeech();
  }, [I, P, settings.readAloud, resumeSpeech, stopSpeak]);

  // Leaving the reader (or the tab) stops the voice — no talking to nobody.
  useEffect(
    () => () => {
      stopSpeech();
    },
    [],
  );

  // Manual steps while playing re-arm the timer for the new part —
  // playback continues (the auto tick's own advance re-arms the same way).
  useEffect(() => {
    if (autoPlayingRef.current) armAuto();
  }, [I, P, autoPlaying, armAuto]);

  // Speed changes mid-playback re-time the current part.
  useEffect(() => {
    if (autoPlayingRef.current) armAuto();
  }, [settings.autoScrollSpeed, armAuto]);

  // New book: stay paused. Tab/app switch: pause with no resume.
  useEffect(() => {
    stopAutoHard();
  }, [bookId, stopAutoHard]);
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stopAutoHard();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stopAutoHard]);
  useEffect(
    () => () => {
      clearAutoTimer();
      if (speedFlashTimer.current) window.clearTimeout(speedFlashTimer.current);
    },
    [clearAutoTimer],
  );

  // Briefly reveal the bar on every page change.
  const prevPageRef = useRef(curPage);
  useEffect(() => {
    if (prevPageRef.current !== curPage) {
      prevPageRef.current = curPage;
      // v4.4: no chrome flash while auto-scrolling — full focus.
      if (!autoPlayingRef.current) showChrome(1200);
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

  // --- Anchored cards (action popup + meaning card): his openPop math ---
  // Below the item (+16), flipping above near the bottom, right-aligned
  // to the item. v4.1: the math GUARANTEES the card is fully inside the
  // viewport with ≥16px margins on every side, whatever the anchor's
  // size/position — the measured size is clamped first (CSS also caps
  // .menu with max-width/max-height, so offsetWidth/offsetHeight can't
  // exceed the viewport), then both axes are hard-clamped.
  const anchorCard = useCallback(
    (cardRef: React.RefObject<HTMLElement | null>, i: number) => {
      const m = cardRef.current;
      const track = trackRef.current;
      if (!track || !m) return;
      const el = track.querySelector<HTMLElement>(`[data-item="${i}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const mw = Math.min(m.offsetWidth || 0, vw - 32);
      const mh = Math.min(m.offsetHeight || 0, vh - 32);
      let top = r.bottom + 16;
      if (top + mh > vh - 16) top = Math.max(16, r.top - mh - 16);
      top = Math.max(16, Math.min(top, vh - mh - 16));
      const left = Math.max(16, Math.min(vw - mw - 16, r.right - mw));
      m.style.top = `${top}px`;
      m.style.left = `${left}px`;
    },
    [],
  );

  // FIX 3: re-clamp the selection pill horizontally after it renders, so
  // the real (not guessed) width is what stays inside the viewport.
  useEffect(() => {
    if (!sel) return;
    const raf = requestAnimationFrame(() => {
      const pill = pillRef.current;
      if (!pill) return;
      const w = pill.offsetWidth;
      setSel((prev) =>
        prev
          ? { ...prev, left: Math.max(16, Math.min(prev.left, window.innerWidth - w - 12)) }
          : prev,
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [sel]);

  // --- Action popup, anchored at the item (his openPop positioning) ---
  const openPop = useCallback(
    (i: number, p: number) => {
      // v4.4: the popup pauses playback transiently — resume on close.
      pauseAutoTransientRef.current();
      setPop({ i, p });
      setCopied(false);
      setNoteEditing(false);
      setNoteDraft("");
      requestAnimationFrame(() => anchorCard(menuRef, i));
    },
    [anchorCard],
  );

  // --- v4: meaning lookup for the selected text ---
  const openMeaning = useCallback(async () => {
    const s = selRef.current;
    const b = bookRef.current;
    if (!s || !b) return;
    const { item } = posRef.current;
    const it = itemsRef.current[item];
    const sentence =
      partsRef.current[item]?.[posRef.current.part] ?? it?.text ?? "";
    const text = s.text;
    // v4.4: the meaning card pauses playback transiently. Pause first,
    // then collapse without resuming (the resume comes on card close).
    pauseAutoTransientRef.current();
    collapseSelection(false);
    setMeaning({ text, status: "loading", saved: false });
    requestAnimationFrame(() => anchorCard(meaningCardRef, item));
    const key = getEffectiveApiKey();
    const outcome = await lookupMeaning({ text, sentence, apiKey: key });
    // The card may have been closed while the lookup was in flight.
    if (meaningRef.current?.text !== text) return;
    if (outcome.status === "ready" && outcome.model) {
      const model = outcome.model;
      const norm = text.toLowerCase().trim();
      const alreadySaved = vocabRef.current.some((v) => v.norm === norm);
      setMeaning({ text, status: "ready", model, saved: alreadySaved });
      // The AI "in this sentence" line for single words never blocks the
      // dictionary result — it appends when it arrives (cached per norm).
      if (key && !/\s/.test(text.trim()) && !model.inContext) {
        const cacheKey = `${norm}::${sentence.slice(0, 120)}`;
        const cached = contextCache.get(cacheKey);
        if (cached) {
          setMeaning((prev) =>
            prev && prev.text === text
              ? { ...prev, model: { ...prev.model!, inContext: cached } }
              : prev,
          );
        } else {
          void geminiInContext(text.trim(), sentence, key).then((line) => {
            if (!line) return;
            contextCache.set(cacheKey, line);
            setMeaning((prev) =>
              prev && prev.text === text
                ? { ...prev, model: { ...prev.model!, inContext: line } }
                : prev,
            );
          });
        }
      }
    } else {
      setMeaning({
        text,
        status: outcome.status,
        saved: false,
        query: outcome.query,
      });
    }
  }, [anchorCard, collapseSelection]);

  const copySelection = useCallback(async () => {
    const s = selRef.current;
    collapseSelection();
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s.text);
    } catch {
      /* ignore */
    }
  }, [collapseSelection]);

  // Re-anchor the meaning card when its content height changes (loading ->
  // definition), so it never overflows the viewport bottom.
  const meaningStatus = meaning?.status ?? null;
  useEffect(() => {
    if (!meaningStatus) return;
    const raf = requestAnimationFrame(() =>
      anchorCard(meaningCardRef, posRef.current.item),
    );
    return () => cancelAnimationFrame(raf);
  }, [meaningStatus, anchorCard]);

  // FIX 3: cards can also grow AFTER anchoring — webfonts arriving late
  // reflow the text and widen the card past the clamped position (this is
  // exactly what pushed the note editor off the right edge). A
  // ResizeObserver re-runs the clamp whenever a card's own size changes,
  // so it can never end up hanging off the screen.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    if (!pop && !meaning) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (pop) anchorCard(menuRef, pop.i);
        else if (meaning) anchorCard(meaningCardRef, posRef.current.item);
      });
    });
    if (menuRef.current) ro.observe(menuRef.current);
    if (meaningCardRef.current) ro.observe(meaningCardRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [pop, meaning, anchorCard]);

  const saveWord = useCallback(async () => {
    const m = meaningRef.current;
    const b = bookRef.current;
    if (!m?.model || !b) return;
    const { item, part } = posRef.current;
    const it = itemsRef.current[item];
    const defs = m.model.groups.flatMap((g) =>
      g.defs.map((d) => `${g.partOfSpeech} — ${d.definition}`),
    );
    const rec = await saveVocab({
      bookId: b.id,
      text: m.model.word || m.text,
      norm: m.text.toLowerCase().trim(),
      phonetic: m.model.phonetic,
      defs,
      contextMeaning: m.model.inContext,
      bookTitle: b.title,
      page: (it?.page ?? 0) + 1,
      item,
      part,
      sentence: it?.text ?? "",
    }).catch(() => null);
    if (!rec) return;
    setVocab((prev) => {
      const rest = prev.filter((r) => r.id !== rec.id);
      return [rec, ...rest].sort((a, z) => z.savedAt - a.savedAt);
    });
    setMeaning((prev) => (prev ? { ...prev, saved: true } : prev));
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
      // v4: while a selection is active, a meaning card open, or the Ask
      // sheet open, every stepping input is suppressed. v4.1: also while a
      // long-press is pending or a selection drag is in progress.
      if (
        selRef.current ||
        meaningRef.current ||
        askOpenRef.current ||
        lpRef.current ||
        extendRef.current
      )
        return;
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
      // v4: a touch-drag that is actually selecting text must not step.
      // v4.1: the long-press pending state and the selection drag both
      // suppress stepping too.
      if (
        selRef.current ||
        meaningRef.current ||
        askOpenRef.current ||
        lpRef.current ||
        extendRef.current
      )
        return;
      const dy = ty - e.touches[0].clientY;
      if (Math.abs(dy) > 30) {
        goRef.current(dy > 0 ? 1 : -1);
        moved.current = true;
      }
    };

    const onClick = (e: MouseEvent) => {
      // The click that follows a swallowed tap-outside popup dismissal must
      // not step, select, or reveal chrome.
      if (Date.now() < suppressUntil.current) return;
      // v4.1: the synthetic click that can follow a long-press/drag
      // selection gesture must never step or open the action popup.
      if (Date.now() - lastSelEndRef.current < 600) return;
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
      // v4: overlays own their keys. Escape unwinds topmost-first;
      // any other key is swallowed while a selection, meaning card,
      // or the Ask sheet is open (stepping stays suppressed).
      if (selRef.current) {
        if (e.key === "Escape") collapseSelection();
        return;
      }
      if (meaningRef.current) {
        if (e.key === "Escape") closeMeaning();
        return;
      }
      if (askOpenRef.current) {
        if (e.key === "Escape") closeAskRef.current();
        return;
      }
      if (popRef.current) {
        if (e.key === "Escape") closePop();
        return;
      }
      if (editingRef.current) return; // the page field owns its keys
      // v4.4: Space toggles auto-scroll (it no longer steps forward).
      // Only when the reader owns the key — never inside an input.
      if (e.key === " ") {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
        e.preventDefault();
        toggleAutoRef.current();
        return;
      }
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowRight" ||
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

    // v4.1: custom long-press selection. No native selection is ever
    // created, so Android's Define/Copy/Select all/Web search toolbar can
    // never appear. The range is painted with the CSS Custom Highlight
    // API; the pill consumes range.toString() like the old native path.
    const curItemEl = () => {
      const track = trackRef.current;
      if (!track) return null;
      return track.querySelector<HTMLElement>(
        `[data-item="${posRef.current.item}"]`,
      );
    };
    const fireLongPress = (x: number, y: number) => {
      lpRef.current = null;
      const scope = curItemEl();
      if (!scope) return;
      raiseCustomSelection(wordRangeAt(x, y, scope));
      // The press is still held: further movement extends the selection
      // (anchored at the word start) — phrases/idioms, one gesture.
      const raised = selRangeRef.current;
      if (raised)
        extendRef.current = {
          node: raised.startContainer,
          offset: raised.startOffset,
        };
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (popRef.current || meaningRef.current || askOpenRef.current) return;
      if (selRef.current) {
        // Re-drag: a press starting inside the painted selection extends
        // it (the capture dismissal let it through). Anchor the far end.
        const r = selRangeRef.current;
        if (r) {
          const rect = r.getBoundingClientRect();
          if (
            e.clientX >= rect.left - 8 &&
            e.clientX <= rect.right + 8 &&
            e.clientY >= rect.top - 8 &&
            e.clientY <= rect.bottom + 8
          ) {
            const midX = (rect.left + rect.right) / 2;
            extendRef.current =
              e.clientX < midX
                ? { node: r.endContainer, offset: r.endOffset }
                : { node: r.startContainer, offset: r.startOffset };
          }
        }
        return;
      }
      const t = e.target as HTMLElement;
      const partEl = t.closest?.("[data-p]");
      const itemEl = t.closest?.("[data-item]");
      if (
        !partEl ||
        !itemEl ||
        Number(itemEl.getAttribute("data-item")) !== posRef.current.item
      )
        return;
      lpRef.current = {
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(
          () => fireLongPress(e.clientX, e.clientY),
          450,
        ),
      };
    };
    const onPointerMove = (e: PointerEvent) => {
      const lp = lpRef.current;
      if (lp) {
        // Finger moved before the hold completed: this was a scroll/step
        // gesture, not a selection. Cancel and let the touch logic run.
        if (Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) {
          window.clearTimeout(lp.timer);
          lpRef.current = null;
        }
        return;
      }
      if (extendRef.current && e.buttons & 1) {
        const scope = curItemEl();
        if (!scope) return;
        const r = extendSelection(
          extendRef.current,
          e.clientX,
          e.clientY,
          scope,
        );
        if (r) raiseCustomSelection(r);
      }
    };
    const onPointerUp = () => {
      // Only a selection that actually STARTED (long-press fired and/or a
      // drag is in flight) suppresses the click that follows. A plain tap
      // — long-press timer still pending — must keep its normal click
      // behavior (double-tap opens the popup, taps step).
      const hadGesture =
        extendRef.current !== null || selRef.current !== null;
      if (lpRef.current) {
        window.clearTimeout(lpRef.current.timer);
        lpRef.current = null;
      }
      if (extendRef.current) extendRef.current = null;
      // The synthetic click that can follow a selection gesture must
      // never step or open the action popup.
      if (hadGesture) lastSelEndRef.current = Date.now();
    };
    const onPointerCancel = () => {
      if (lpRef.current) {
        window.clearTimeout(lpRef.current.timer);
        lpRef.current = null;
      }
      extendRef.current = null;
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchmove", onTouchMove, { passive: true });
    stage.addEventListener("click", onClick);
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("click", onClick);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKey);
    };
    // `book` in deps: the effect must (re-)attach once the stage exists
    // after the book loads — on first render we bail out at `!stage`.
  }, [
    book,
    closePop,
    openPop,
    showChrome,
    hideChrome,
    collapseSelection,
    closeMeaning,
    raiseCustomSelection,
    toggleAuto,
    closeAsk,
  ]);

  // v4.1: nothing to watch — selection is fully custom (long-press +
  // CSS Highlight API). The native `selectionchange` listener is gone
  // because the native Selection is never created.

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

  /** v4: jump the reader to an exact item+part (Ask quote taps, Words rows). */
  const jumpToPart = useCallback(
    (item: number, part: number) => {
      closeReadingOverlays();
      closeAskRef.current();
      const pl = partsRef.current[item];
      setPos({
        item: clamp(item, 0, itemsRef.current.length - 1),
        part: pl ? clamp(part, 0, Math.max(0, pl.length - 1)) : 0,
      });
    },
    [closeReadingOverlays],
  );

  // Saved vocab norms, longest-first is handled inside decorateText.
  const vocabNorms = useMemo(() => vocab.map((v) => v.norm), [vocab]);

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
      className={`reader-root fixed inset-0 flex flex-col overflow-hidden${
        pop || meaning || askOpen ? " fx" : ""
      }`}
      // One dismissal mechanism for every floating card (v3.2, extended in
      // v4): while an overlay is open, a press ANYWHERE outside it (capture
      // phase, before any other handler) closes it and swallows the gesture
      // — the tap can never also step, select, reveal chrome, or hit a
      // chrome button.
      onPointerDownCapture={(e) => {
        const t = e.target as Node;
        if (
          menuRef.current?.contains(t) ||
          pillRef.current?.contains(t) ||
          meaningCardRef.current?.contains(t) ||
          askLayerRef.current?.contains(t)
        )
          return;
        let closed = false;
        if (popRef.current) {
          closePop();
          closed = true;
        }
        if (meaningRef.current) {
          closeMeaning();
          closed = true;
        }
        if (selRef.current) {
          // v4.1: a press starting inside the painted selection begins a
          // re-drag (handled by the stage pointer handlers) — it must not
          // collapse the selection first.
          const r = selRangeRef.current;
          const rect = r?.getBoundingClientRect();
          const inside =
            !!rect &&
            e.clientX >= rect.left - 8 &&
            e.clientX <= rect.right + 8 &&
            e.clientY >= rect.top - 8 &&
            e.clientY <= rect.bottom + 8;
          if (!inside) {
            collapseSelection();
            closed = true;
          }
        }
        if (askOpenRef.current) {
          closeAskRef.current();
          closed = true;
        }
        if (closed) {
          suppressUntil.current = Date.now() + 450;
          e.stopPropagation();
        }
      }}
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
        <button
          onClick={() => {
            if (Date.now() < suppressUntil.current) return;
            // v4.4: leaving the reader stays paused — no resume later.
            stopAutoHard();
            onBack();
          }}
          aria-label="Back to library"
        >
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
              // A tap swallowed as popup dismissal must not start editing.
              if (Date.now() < suppressUntil.current) {
                e.target.blur();
                return;
              }
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
          <button
            aria-label="Smaller text"
            onClick={() => {
              if (Date.now() < suppressUntil.current) return;
              adjustMainSize(-2);
            }}
          >
            A−
          </button>
          <button
            aria-label="Larger text"
            onClick={() => {
              if (Date.now() < suppressUntil.current) return;
              adjustMainSize(2);
            }}
          >
            A+
          </button>
          <button
            data-testid="saved-btn"
            aria-label="Saved marks"
            onClick={() => {
              if (Date.now() < suppressUntil.current) return;
              // v4.4: leaving the reader stays paused — no resume later.
              stopAutoHard();
              onOpenSaved();
            }}
          >
            <SavedIcon />
          </button>
          <button
            data-testid="settings-gear"
            aria-label="Settings"
            onClick={() => {
              if (Date.now() < suppressUntil.current) return;
              // v4.4: Settings stays paused — no resume later.
              stopAutoHard();
              onOpenSettings();
            }}
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
                      {decorateText(t, vocabNorms).map((run, k) =>
                        run.match ? (
                          <span key={k} className="voc">
                            {run.text}
                          </span>
                        ) : (
                          <span key={k}>{run.text}</span>
                        ),
                      )}
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
          onClick={() => {
            if (Date.now() < suppressUntil.current) return;
            chap(-1);
          }}
          aria-label="Previous section"
        >
          «
        </button>
        <button
          data-testid="nav-prev-page"
          onClick={() => {
            if (Date.now() < suppressUntil.current) return;
            toPage(curPage - 1);
          }}
          aria-label="Previous page"
        >
          ‹
        </button>
        <button
          data-testid="nav-next-page"
          onClick={() => {
            if (Date.now() < suppressUntil.current) return;
            toPage(curPage + 1);
          }}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          data-testid="nav-next-section"
          onClick={() => {
            if (Date.now() < suppressUntil.current) return;
            chap(1);
          }}
          aria-label="Next section"
        >
          »
        </button>
      </nav>

      {/* v4: the "?" — a ghost button that joins the unified auto-hiding
          chrome: visible exactly when the chrome is, stacked above « ‹ › ». */}
      <button
        data-testid="ask-btn"
        aria-label="Ask about this passage"
        className={`ask-btn${chromeVisible ? " show" : ""}`}
        onClick={() => {
          if (Date.now() < suppressUntil.current) return;
          showChrome();
          // v4.4: the Ask sheet pauses playback transiently.
          pauseAutoTransientRef.current();
          setAskOpen(true);
        }}
      >
        ?
      </button>

      {/* v4.4: auto-scroll play/pause — same chrome cluster as the "?":
          visible exactly when the chrome is, beside it. Tap toggles;
          long-press (~500ms) cycles the speed 1× → 1.25× → 1.5× → 0.75×. */}
      <button
        data-testid="autoscroll-btn"
        aria-label={autoPlaying ? "Pause auto-scroll" : "Start auto-scroll"}
        className={`auto-btn${chromeVisible ? " show" : ""}`}
        onPointerDown={(e) => {
          if (Date.now() < suppressUntil.current) return;
          autoLpFiredRef.current = false;
          autoLpRef.current = {
            x: e.clientX,
            y: e.clientY,
            timer: window.setTimeout(() => {
              autoLpRef.current = null;
              autoLpFiredRef.current = true;
              cycleSpeed();
            }, 500),
          };
        }}
        onPointerMove={(e) => {
          const lp = autoLpRef.current;
          if (
            lp &&
            Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10
          ) {
            window.clearTimeout(lp.timer);
            autoLpRef.current = null;
          }
        }}
        onPointerUp={() => {
          if (autoLpRef.current) {
            window.clearTimeout(autoLpRef.current.timer);
            autoLpRef.current = null;
          }
        }}
        onPointerLeave={() => {
          if (autoLpRef.current) {
            window.clearTimeout(autoLpRef.current.timer);
            autoLpRef.current = null;
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (Date.now() < suppressUntil.current) return;
          // A long-press must not also toggle.
          if (autoLpFiredRef.current) {
            autoLpFiredRef.current = false;
            return;
          }
          toggleAuto();
        }}
      >
        {autoPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      {/* v4.4: transient speed label after a long-press cycle. */}
      {speedFlash && (
        <span data-testid="autoscroll-speed" className="auto-speed show">
          {speedFlash}
        </span>
      )}

      {/* v4: the floating selection pill (Meaning / Copy), above the selection. */}
      {sel && !meaning && (
        <div
          ref={pillRef}
          data-testid="selection-pill"
          className="sel-pill"
          style={{ top: sel.top, left: sel.left }}
        >
          <button
            data-testid="sel-meaning"
            className="sel-primary"
            onClick={() => void openMeaning()}
          >
            Meaning
          </button>
          <button data-testid="sel-copy" onClick={() => void copySelection()}>
            Copy
          </button>
        </div>
      )}

      {/* v4: the meaning card — anchored at the sentence, popup-card styling. */}
      {meaning && (
        <div className="meaning-layer" data-testid="meaning-layer">
          <div
            ref={meaningCardRef}
            data-testid="meaning-card"
            className="menu meaning-card"
            role="dialog"
            aria-label="Word meaning"
          >
            {meaning.status === "loading" && (
              <div className="meaning-status">Looking it up…</div>
            )}
            {meaning.status === "ready" && meaning.model && (
              <>
                <div className="meaning-word">{meaning.model.word}</div>
                {meaning.model.phonetic && (
                  <div className="meaning-phonetic">
                    {meaning.model.phonetic}
                  </div>
                )}
                {meaning.model.groups.map((g, gi) => (
                  <div key={gi}>
                    <div className="meaning-pos">{g.partOfSpeech}</div>
                    {g.defs.map((d, di) => (
                      <div key={di}>
                        <div className="meaning-def">
                          {di + 1}. {d.definition}
                        </div>
                        {d.example && (
                          <div className="meaning-example">
                            "{d.example}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                {meaning.model.inContext && (
                  <div className="meaning-context">
                    <b>In this sentence</b>
                    {meaning.model.inContext}
                  </div>
                )}
                <div className="meaning-actions">
                  <button
                    data-testid="meaning-save"
                    className={`meaning-save${meaning.saved ? " saved" : ""}`}
                    disabled={meaning.saved}
                    onClick={() => void saveWord()}
                  >
                    {meaning.saved ? "Saved ✓" : "Save word"}
                  </button>
                  <button
                    data-testid="meaning-close"
                    className="meaning-close"
                    onClick={closeMeaning}
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
            {meaning.status === "not-found" && (
              <div className="meaning-status">
                Not in the dictionary.
                <br />
                Check the spelling, or select fewer words.
                <div className="meaning-actions">
                  <button
                    data-testid="meaning-close"
                    className="meaning-close"
                    onClick={closeMeaning}
                    style={{ flex: 1 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
            {meaning.status === "needs-key" && (
              <div className="meaning-status">
                Phrases need the AI to define them.
                <br />
                Add your free Gemini key to switch it on.
                <div className="meaning-actions">
                  <button
                    data-testid="meaning-to-settings"
                    className="meaning-save"
                    style={{ flex: 1 }}
                    onClick={() => {
                      // v4.4: Settings stays paused — no resume later.
                      stopAutoHard();
                      closeMeaning();
                      onOpenSettings();
                    }}
                  >
                    Add key in Settings
                  </button>
                  <button
                    data-testid="meaning-close"
                    className="meaning-close"
                    onClick={closeMeaning}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            {meaning.status === "offline" && (
              <div className="meaning-status">
                Couldn't reach the dictionary. Check your connection — or add
                a Gemini key in Settings and meanings will come from AI
                instead.
                <div className="meaning-actions">
                  <button
                    data-testid="meaning-to-settings"
                    className="meaning-save"
                    style={{ flex: 1 }}
                    onClick={() => {
                      // v4.4: Settings stays paused — no resume later.
                      stopAutoHard();
                      closeMeaning();
                      onOpenSettings();
                    }}
                  >
                    Add key in Settings
                  </button>
                  <button
                    data-testid="meaning-close"
                    className="meaning-close"
                    onClick={closeMeaning}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            {meaning.status === "error" && (
              <div className="meaning-status">
                Something went wrong looking that up — try again.
                <div className="meaning-actions">
                  <button
                    data-testid="meaning-close"
                    className="meaning-close"
                    onClick={closeMeaning}
                    style={{ flex: 1 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* v4: the Ask sheet. */}
      <div ref={askLayerRef}>
        {askOpen && book && (
          <AskSheet
            bookId={bookId}
            book={book}
            itemIndex={I}
            onClose={closeAsk}
            onJump={jumpToPart}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>

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
