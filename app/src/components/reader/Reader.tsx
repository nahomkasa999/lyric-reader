// The reader (v4.13) — the module's orchestrator.
//
// Item stream + per-part stepping (lib/parts.ts splitS), a translating
// track that centres the current item (or current part), click-first
// input, the action popup anchored at the sentence with the .fx focus
// effect, and an inline editable page number in the top bar.
//
// The parts have moved out: the stage, the popup and the floating cards
// are components (ReaderStage, ReaderPopup, ReaderOverlays), the book
// and the chrome are hooks (useReaderBook, useReaderChrome), the
// gestures are two hooks (useReaderStepping, useReaderSelectionGestures)
// and the shapes they share live in readerTypes.ts.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { stepParts } from "../../lib/types";
import { splitS } from "../../lib/parts";
import type { Item } from "../../lib/types";
import type { VocabRecord } from "../../lib/db";
import { useSettings } from "../../lib/settings";
import { highlightsSupported, paintSelection } from "../../lib/selection";
import { getElevenLabsKey } from "../../lib/elevenlabs";
import TopBar from "./TopBar";
import VoiceSheet from "./VoiceSheet";
import ReaderControls from "./ReaderControls";
import OutlineSheet from "./OutlineSheet";
import YoutubeAudio from "./YoutubeAudio";
import { BookmarkIcon, CopyIcon, HighlightIcon, NoteIcon } from "./icons";
import ReaderStage from "./ReaderStage";
import ReaderPopup from "./ReaderPopup";
import ReaderOverlays from "./ReaderOverlays";
import { useReaderBook } from "./useReaderBook";
import { useReaderChrome } from "./useReaderChrome";
import { useGestureShared, type GestureDeps } from "./readerGestures";
import { useReaderStepping } from "./useReaderStepping";
import { useReaderKeys } from "./useReaderKeys";
import { useReaderMeaning } from "./useReaderMeaning";
import { useReaderAutoScroll } from "./useReaderAutoScroll";
import { useReaderVoice } from "./useReaderVoice";
import { useReaderMarks } from "./useReaderMarks";
import type { ReadAloud } from "./useReadAloud";
import { useReaderSelectionGestures } from "./useReaderSelectionGestures";
import {
  type MeaningState,
  type PopTarget,
  type PopupRow,
  type SelectionState,
  type VocabPreviewState,
} from "./readerTypes";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export default function Reader({
  bookId,
  onBack,
  onOpenSettings,
  onOpenSaved,
  onOpenAssistant,
  assistantOpen,
}: import("./readerTypes").ReaderProps) {
  const chrome = useReaderChrome();
  const { show: showChrome, hide: hideChrome, menuOpen, setMenuOpen } = chrome;
  const bookState = useReaderBook(bookId, showChrome);
  const { book } = bookState;
  const { pos, setPos, marks, setMarks, vocab, setVocab, failed } = bookState;
  const { settings, update: updateSettings } = useSettings();

  const [pop, setPop] = useState<PopTarget | null>(null);
  const [copied, setCopied] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [sel, setSel] = useState<SelectionState | null>(null);
  const [meaning, setMeaning] = useState<MeaningState | null>(null);
  const [vocabPreview, setVocabPreview] = useState<VocabPreviewState | null>(
    null,
  );
  // v4.4: auto-scroll (auto-advance, part by part) + speed flash label.
  const [speedFlash, setSpeedFlash] = useState<string | null>(null);
  // v4.13: the outline — the book's chapters, in a sheet over the reader.
  const [outlineOpen, setOutlineOpen] = useState(false);

  const autoPlayingRef = useRef(false);
  // The voice is reading: the auto-scroll must not outrun it.
  const voiceBusyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const meaningCardRef = useRef<HTMLDivElement | null>(null);
  // v4.9: the voice sheet's layer — a press on the page behind it must
  // not step the sentence while the picker is open.
  const voiceLayerRef = useRef<HTMLDivElement | null>(null);
  // v4.13: the outline sheet's layer + the saved-word preview card.
  const outlineLayerRef = useRef<HTMLDivElement | null>(null);
  const vocabCardRef = useRef<HTMLDivElement | null>(null);

  // Refs mirroring state so native handlers always see fresh values.
  const popRef = useRef<PopTarget | null>(null);
  popRef.current = pop;
  // The page field (TopBar) reports when it is being edited.
  const editingRef = chrome.editing;
  const selRef = useRef<SelectionState | null>(null);
  selRef.current = sel;
  const meaningRef = useRef<MeaningState | null>(null);
  meaningRef.current = meaning;
  const vocabRef = useRef<VocabRecord[]>(vocab);
  vocabRef.current = vocab;
  const outlineOpenRef = useRef(outlineOpen);
  outlineOpenRef.current = outlineOpen;
  const vocabPreviewRef = useRef<VocabPreviewState | null>(null);
  vocabPreviewRef.current = vocabPreview;
  const voiceSheetRef = useRef(false);
  const assistantOpenRef = useRef(assistantOpen);
  assistantOpenRef.current = assistantOpen;
  const itemsRef = useRef<Item[]>([]);
  const items = book?.items ?? [];
  itemsRef.current = items;
  // Parts per item (his splitS), cached per book.
  const parts = useMemo(() => items.map((it) => splitS(it.text)), [items]);
  const partsRef = useRef<string[][]>([]);
  partsRef.current = parts;
  // The two callbacks the overlays call through their refs.
  const maybeResumeAutoRef = useRef<() => void>(() => {});
  const pauseAutoTransientRef = useRef<() => void>(() => {});
  // Timestamp until which stage/chrome clicks are ignored, set when a
  // tap-outside popup dismissal swallows the pointerdown (the click that
  // follows it must not trigger anything).
  const suppressUntil = useRef(0);
  // v4.1: custom selection (no native Selection ever — that is what
  // summoned Android's Define/Copy/Select all/Web search toolbar).
  const selRangeRef = useRef<Range | null>(null);
  const lpRef = useRef<{ x: number; y: number; timer: number } | null>(null);
  // While the press keeps dragging (after the long-press fired, or a
  // re-drag started on the painted selection), this anchors the fixed
  // end of the selection; the loose end follows the pointer.
  const extendRef = useRef<{ node: Node; offset: number } | null>(null);
  // v4.7: the voice — the read-aloud hook fills this in below.
  const voiceRef = useRef<ReadAloud | null>(null);

  const I = pos.item;
  const P = pos.part;
  const curPage = items[I]?.page ?? 0;
  const pages = items.length ? items[items.length - 1].page + 1 : 0;
  const cp = curPage + 1;
  const pct = items.length
    ? Math.round((I / Math.max(1, items.length - 1)) * 100)
    : 0;

  // --- Core moves ---
  const closePop = useCallback(() => {
    popRef.current = null;
    setPop(null);
    setCopied(false);
    // v4.4: a popup that paused playback gives it back on close.
    maybeResumeAutoRef.current();
    // v4.7: the voice picks the sentence up again.
    voiceRef.current?.resume();
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
      CSS.highlights?.delete("lr-sel");
    } catch {
      /* ignore */
    }
    if (resume) {
      maybeResumeAutoRef.current();
      // v4.7: the voice picks the sentence up again.
      voiceRef.current?.resume();
    }
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
    // v4.7: the voice stops while a selection is open.
    voiceRef.current?.stop();
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
    // v4.7: the voice picks the sentence up again.
    voiceRef.current?.resume();
  }, []);

  /** Anything that moves the reading position closes the reading overlays:
      popup, selection, meaning card. */
  const closeReadingOverlays = useCallback(() => {
    closePop();
    collapseSelection();
    closeMeaning();
  }, [closePop, collapseSelection, closeMeaning]);

  const go = useCallback(
    (dir: 1 | -1) => {
      closeReadingOverlays();
      setPos((p: typeof pos) => stepParts(partsRef.current, p, dir));
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
      const { item: cur } = bookState.posRef.current;
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

  // --- v4.8: read aloud ---
  const readerVoice = useReaderVoice({
    partsRef,
    posRef: bookState.posRef,
    setPos,
    popRef,
    selRef,
    meaningRef,
    assistantOpenRef,
    voiceSheetRef,
    outlineOpenRef,
    vocabPreviewRef,
    item: I,
    part: P,
    follow: settings.readAloud,
    voice: settings.readAloudVoice,
    systemVoice: settings.readAloudSystemVoice,
    rate: settings.readAloudRate,
    engine: settings.readAloudEngine,
    key: getElevenLabsKey(),
    setMenuOpen,
    showChrome,
    suppressUntil,
    voiceRef,
  });
  const voice = readerVoice.voice;
  const voiceSheet = readerVoice.voiceSheet;
  const openVoice = readerVoice.openVoice;
  const closeVoiceSheet = readerVoice.closeVoiceSheet;
  const closeVoiceSheetRef = readerVoice.closeVoiceSheetRef;

  // --- v4.4: auto-scroll (auto-advance, part by part) ---
  const auto = useReaderAutoScroll({
    partsRef,
    posRef: bookState.posRef,
    item: I,
    part: P,
    popRef,
    selRef,
    meaningRef,
    assistantOpenRef,
    outlineOpenRef,
    vocabPreviewRef,
    setPos,
    setSpeedFlash,
    hideChrome,
    closeReadingOverlays,
    speed: settings.autoScrollSpeed,
    updateSpeed: (v) => updateSettings({ autoScrollSpeed: v }),
    bookId,
    voiceBusy: voice.speaking || voice.session,
    voiceBusyRef,
    maybeResumeAutoRef,
    pauseAutoTransientRef,
  });
  const autoPlaying = auto.playing;
  const stopAutoHard = auto.stopHard;
  const toggleAuto = auto.toggle;
  const cycleSpeed = auto.cycleSpeed;
  autoPlayingRef.current = auto.playing;
  voiceBusyRef.current = voice.speaking || voice.session;

  // --- v4.13: the outline — the book's chapters, in a sheet ---
  const openOutline = useCallback(() => {
    if (Date.now() < suppressUntil.current) return;
    setMenuOpen(false);
    // The sheet pauses playback transiently — it gives it back on close.
    pauseAutoTransientRef.current();
    voiceRef.current?.stop();
    setOutlineOpen(true);
    showChrome(3000);
  }, [showChrome]);

  const closeOutline = useCallback(() => {
    setOutlineOpen(false);
    auto.maybeResumeAuto();
  }, [auto]);
  const closeOutlineRef = useRef(closeOutline);
  closeOutlineRef.current = closeOutline;

  // --- v4.13: the saved-word preview ---
  /** Tap a dotted word in the text and this card says what it means. */
  const openVocabPreview = useCallback(
    (
      record: VocabRecord,
      el: HTMLElement,
      item: number,
      part: number,
    ) => {
      // The card owns the pause while it is open: the transient pause the
      // overlays were holding is dropped, so closing them must not resume.
      closePop();
      collapseSelection(false);
      closeMeaning();
      auto.holdForCard();
      // v4.7: the voice stops while the card is open.
      voiceRef.current?.stop();
      const r = el.getBoundingClientRect();
      setVocabPreview({
        record,
        top: r.bottom + 12,
        left: clamp(r.left, 12, window.innerWidth - 220),
      });
      // The word may sit on another sentence — the reader goes there.
      if (item !== bookState.posRef.current.item) {
        setPos({ item, part });
      }
    },
    [auto, closePop, collapseSelection, closeMeaning],
  );

  const closeVocabPreview = useCallback(() => {
    vocabPreviewRef.current = null;
    setVocabPreview(null);
    auto.maybeResumeAuto();
    voiceRef.current?.resume();
  }, [auto]);

  // Keep the preview card inside the screen — the word can sit anywhere.
  useEffect(() => {
    if (!vocabPreview) return;
    const raf = requestAnimationFrame(() => {
      const card = vocabCardRef.current;
      if (!card) return;
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      setVocabPreview((prev) => {
        if (!prev) return prev;
        const left = Math.max(
          12,
          Math.min(prev.left, window.innerWidth - w - 12),
        );
        const top = Math.max(12, Math.min(prev.top, window.innerHeight - h - 12));
        if (left === prev.left && top === prev.top) return prev;
        return { ...prev, left, top };
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [vocabPreview]);

  // --- Track placement (his place()): centre the current item; if it has
  // more than one part and is taller than half the stage, centre the
  // current part instead. ---
  const place = useCallback(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track) return;
    const el = track.querySelector<HTMLElement>(
      `[data-item="${bookState.posRef.current.item}"]`,
    );
    if (!el) return;
    let t: HTMLElement = el;
    let o = 0;
    if (
      el.children.length > 1 &&
      el.offsetHeight > stage.clientHeight * 0.5
    ) {
      const c = el.children[bookState.posRef.current.part] as
        | HTMLElement
        | undefined;
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
  // to the item. The math GUARANTEES the card is fully inside the
  // viewport with ≥16px margins on every side, whatever the anchor's
  // size/position.
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

  // Re-anchor the meaning card whenever its content changes. It is first
  // placed while it still says "Looking it up…"; the definition — and the
  // AI "in this sentence" line — can arrive later and make it much
  // taller. Without re-running the clamp, a tall card hangs off-screen.
  // This is a layout effect, so the new size is measured and clamped
  // before the frame is painted (a rAF here leaves one off-screen frame).
  useLayoutEffect(() => {
    if (!meaning) return;
    anchorCard(meaningCardRef, bookState.posRef.current.item);
  }, [meaning, anchorCard, bookState.posRef]);

  // A card can grow even after that (late webfonts, a longer definition):
  // observe the card itself and re-clamp on every size change.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    if (!pop && !meaning) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (pop) anchorCard(menuRef, pop.i);
        else if (meaning) {
          anchorCard(meaningCardRef, bookState.posRef.current.item);
        }
      });
    });
    if (menuRef.current) ro.observe(menuRef.current);
    if (meaningCardRef.current) ro.observe(meaningCardRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [pop, meaning, anchorCard, bookState.posRef]);

  // --- v4: the meaning of a word ---
  const meaningState = useReaderMeaning({
    setMeaning,
    meaningRef,
    selRef,
    bookRef: bookState.bookRef,
    posRef: bookState.posRef,
    itemsRef,
    partsRef,
    vocabRef,
    collapseSelection,
    pauseAuto: () => pauseAutoTransientRef.current(),
    stopVoice: () => voiceRef.current?.stop(),
    setVocab,
  });
  const { openMeaning, copySelection, saveWord } = meaningState;

  // Re-clamp the selection pill horizontally after it renders, so the
  // real (not guessed) width is what stays inside the viewport.
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
      // v4.7: the voice stops while the popup is open.
      voiceRef.current?.stop();
      setPop({ i, p });
      setCopied(false);
      setNoteEditing(false);
      setNoteDraft("");
      requestAnimationFrame(() => anchorCard(menuRef, i));
    },
    [anchorCard],
  );

  // --- Input: wheel / keys / swipe / click (his exact semantics) ---
  const gestureShared = useGestureShared();
  const gestureDeps: GestureDeps = {
    stageRef,
    book,
    selRef,
    meaningRef,
    popRef,
    outlineOpenRef,
    vocabPreviewRef,
    assistantOpenRef,
    lpRef,
    extendRef,
    selRangeRef,
    posRef: bookState.posRef,
    itemsRef,
    partsRef,
    vocabRef,
    goRef,
    showChrome,
    hideChrome,
    openPop,
    closePop,
    collapseSelection,
    closeMeaning,
    closeVocabPreview,
    closeOutline,
    editingRef,
    openVocabPreview,
    raiseCustomSelection,
    toggleAuto,
    suppressUntil,
    setPos,
  };
  useReaderStepping(gestureDeps, gestureShared);
  useReaderSelectionGestures(gestureDeps, gestureShared);
  useReaderKeys(gestureDeps);

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
  const markState = useReaderMarks({
    bookId,
    popRef,
    partsRef,
    marks,
    setMarks,
    noteDraft,
  });
  const popMark = markState.popMark;
  const toggleMarkKind = markState.toggleMarkKind;

  // Items on the current page only (his buildPage: the track holds one page).
  const pageItems = useMemo(() => {
    const out: { idx: number; item: Item; parts: string[] }[] = [];
    items.forEach((item, idx) => {
      if (item.page === curPage) out.push({ idx, item, parts: parts[idx] });
    });
    return out;
  }, [items, curPage, parts]);

  /** Jump the reader to an exact item+part (a source chip, a Words row). */
  const jumpToPart = useCallback(
    (item: number, part: number) => {
      closeReadingOverlays();
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

  const rows: PopupRow[] = [
    {
      key: "bookmark",
      label: "Bookmark",
      testid: "popup-bookmark",
      icon: <BookmarkIcon />,
      active: popMark.bookmark,
      activeStyle: {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
      },
      onClick: () => void toggleMarkKind("bookmark"),
    },
    {
      key: "highlight",
      label: "Highlight",
      testid: "popup-highlight",
      icon: <HighlightIcon />,
      active: popMark.highlight,
      activeStyle: { background: "var(--lr-hl)", color: "#000" },
      onClick: () => void toggleMarkKind("highlight"),
    },
    {
      key: "note",
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
      key: "copy",
      label: copied ? "Copied" : "Copy",
      testid: "popup-copy",
      icon: <CopyIcon />,
      active: copied,
      activeStyle: {
        background: "var(--primary)",
        color: "var(--primary-foreground)",
      },
      onClick: () => {
        void markState.doCopy(copied).then((ok) => {
          setCopied(ok);
          if (ok) window.setTimeout(() => setCopied(false), 1500);
        });
      },
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
        pop || meaning || assistantOpen || outlineOpen || vocabPreview
          ? " fx"
          : ""
      }`}
      // One dismissal mechanism for every floating card: while an overlay
      // is open, a press ANYWHERE outside it (capture phase, before any
      // other handler) closes it and swallows the gesture.
      onPointerDownCapture={(e) => {
        const t = e.target as Node;
        if (
          menuRef.current?.contains(t) ||
          pillRef.current?.contains(t) ||
          meaningCardRef.current?.contains(t) ||
          voiceLayerRef.current?.contains(t) ||
          outlineLayerRef.current?.contains(t) ||
          vocabCardRef.current?.contains(t)
        )
          return;
        let closed = false;
        // v4.7: the overflow menu closes on any press outside it.
        if (menuOpen && !(t as HTMLElement).closest?.(".menu-toggle")) {
          setMenuOpen(false);
          closed = true;
        }
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
        // v4.13: a press outside the outline sheet closes it — the
        // reader stays exactly where it was.
        if (outlineOpenRef.current) {
          closeOutlineRef.current();
          closed = true;
        }
        // v4.13: a press outside the saved-word preview closes it.
        if (vocabPreviewRef.current) {
          closeVocabPreview();
          closed = true;
        }
        // v4.9: a press outside the voice picker closes it.
        if (voiceSheetRef.current) {
          closeVoiceSheetRef.current();
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
        if ((nearTop || nearBottom) && !chrome.shown.current) showChrome();
      }}
    >
      {/* Top bar: back · page · menu. Everything else is behind the ⋯. */}
      <TopBar
        visible={chrome.visible}
        page={cp}
        pages={pages}
        onJumpPage={(p) => toPageRef.current(p - 1)}
        onBack={() => {
          if (Date.now() < suppressUntil.current) return;
          // v4.4: leaving the reader stays paused — no resume later.
          stopAutoHard();
          voiceRef.current?.stop();
          onBack();
        }}
        onOpenSaved={() => {
          if (Date.now() < suppressUntil.current) return;
          stopAutoHard();
          voiceRef.current?.stop();
          onOpenSaved();
        }}
        onOpenSettings={() => {
          if (Date.now() < suppressUntil.current) return;
          stopAutoHard();
          voiceRef.current?.stop();
          onOpenSettings();
        }}
        onOpenVoice={openVoice}
        readAloud={settings.readAloud}
        onToggleReadAloud={() => {
          if (Date.now() < suppressUntil.current) return;
          updateSettings({ readAloud: !settings.readAloud });
        }}
        onOpenOutline={openOutline}
        onOpenAssistant={() => {
          if (Date.now() < suppressUntil.current) return;
          stopAutoHard();
          voiceRef.current?.stop();
          onOpenAssistant(book?.title ?? "", I);
        }}
        onTextSize={(delta) => {
          if (Date.now() < suppressUntil.current) return;
          adjustMainSize(delta);
        }}
        onReveal={() => showChrome()}
        onEditingChange={(v) => {
          editingRef.current = v;
        }}
        blocked={() => Date.now() < suppressUntil.current}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((o) => !o)}
        menuRef={menuRef}
      />

      {/* Hairline progress: visible with the chrome only */}
      <div
        data-testid="reader-progress"
        className={`reader-progress shrink-0${chrome.visible ? "" : " chrome-hidden"}`}
        aria-hidden
      >
        <i style={{ width: `${pct}%` }} />
      </div>

      {/* Stage: his translating track, masked at the edges. */}
      <ReaderStage
        items={pageItems}
        current={I}
        part={P}
        marks={marks}
        vocabNorms={vocabNorms}
        stageRef={stageRef}
        trackRef={trackRef}
      />

      {/* The bottom chrome: page rail + the ask / auto-scroll / voice
          cluster, all hidden with the rest of the chrome. */}
      <ReaderControls
        visible={chrome.visible}
        onReveal={() => showChrome()}
        onPrevSection={() => {
          if (Date.now() < suppressUntil.current) return;
          chap(-1);
        }}
        onPrevPage={() => {
          if (Date.now() < suppressUntil.current) return;
          toPage(curPage - 1);
        }}
        onNextPage={() => {
          if (Date.now() < suppressUntil.current) return;
          toPage(curPage + 1);
        }}
        onNextSection={() => {
          if (Date.now() < suppressUntil.current) return;
          chap(1);
        }}
        onAsk={() => {
          if (Date.now() < suppressUntil.current) return;
          showChrome();
          // v4.4: the sheet pauses playback transiently.
          pauseAutoTransientRef.current();
          voiceRef.current?.stop();
          onOpenAssistant(book?.title ?? "", I);
        }}
        autoPlaying={autoPlaying}
        onToggleAuto={() => {
          if (Date.now() < suppressUntil.current) return;
          toggleAuto();
        }}
        onCycleSpeed={() => {
          if (Date.now() < suppressUntil.current) return;
          cycleSpeed();
        }}
        speedFlash={speedFlash}
        speaking={voice.speaking}
        session={voice.session}
        canSpeak={voice.supported}
        onToggleSpeak={() => {
          if (Date.now() < suppressUntil.current) return;
          const wasReading = voiceRef.current?.session;
          voiceRef.current?.toggle();
          // Manners: starting a reading hides the chrome — full focus.
          if (!wasReading) hideChrome();
        }}
        onOpenVoice={openVoice}
      />

      {/* v4.11: YouTube → audio. Bottom-left, on the same level as the
          "?" / ▶ / speaker cluster opposite it. */}
      <YoutubeAudio
        visible={chrome.visible}
        interrupt={voice.speaking || voice.session}
      />

      {/* v4.9: the voice could not do it — say so. The reader must never
          silently swap in another voice and leave the user wondering. */}
      {voice.error && (
        <button
          data-testid="voice-error-toast"
          className="voice-toast show"
          onClick={() => voice.clearError()}
        >
          {voice.error}
        </button>
      )}

      <ReaderOverlays
        selection={sel}
        pillRef={pillRef}
        onMeaning={() => void openMeaning()}
        onCopy={() => void copySelection()}
        meaning={meaning}
        meaningCardRef={meaningCardRef}
        voiceURI={settings.readAloudSystemVoice}
        onSaveWord={() => void saveWord()}
        onCloseMeaning={closeMeaning}
        onOpenSettings={() => {
          // v4.4: Settings stays paused — no resume later.
          stopAutoHard();
          closeMeaning();
          onOpenSettings();
        }}
        vocabPreview={vocabPreview}
        vocabCardRef={vocabCardRef}
        onJumpVocab={() => {
          const rec = vocabPreview?.record;
          closeVocabPreview();
          if (rec) jumpToPart(rec.item, rec.part);
        }}
        onCloseVocab={closeVocabPreview}
      />

      {/* v4.8: the voice sheet — pick a voice, install the HD engine. */}
      <div ref={voiceLayerRef}>
        {voiceSheet && (
          <VoiceSheet
            onClose={closeVoiceSheet}
            voice={settings.readAloudVoice}
            onVoiceChange={(v) => updateSettings({ readAloudVoice: v })}
            systemVoice={settings.readAloudSystemVoice}
            onSystemVoiceChange={(v) =>
              updateSettings({ readAloudSystemVoice: v })
            }
            speed={settings.readAloudRate}
            onSpeedChange={(v) => updateSettings({ readAloudRate: v })}
            engine={settings.readAloudEngine}
            onEngineChange={(v) => updateSettings({ readAloudEngine: v })}
            apiKey={getElevenLabsKey()}
          />
        )}
      </div>

      {/* v4.13: the outline — the book's chapters, in a sheet over the
          reader. Pick one and the reader goes there; ✕ brings it back. */}
      <div ref={outlineLayerRef}>
        {outlineOpen && (
          <OutlineSheet
            items={items}
            current={I}
            onJump={(item) => {
              closeReadingOverlays();
              setPos({ item, part: 0 });
              showChrome(1200);
            }}
            onClose={closeOutline}
          />
        )}
      </div>

      {/* Action popup: one card anchored at the sentence, staggered rows. */}
      {pop && (
        <ReaderPopup
          rows={rows}
          mark={popMark}
          noteEditing={noteEditing}
          noteDraft={noteDraft}
          onNoteDraft={setNoteDraft}
          onSaveNote={() => {
            void markState.saveNote().then(() => setNoteEditing(false));
          }}
          onDeleteNote={() => {
            void markState.deleteNote().then(() => setNoteEditing(false));
          }}
          onCancelNote={() => setNoteEditing(false)}
          menuRef={menuRef}
        />
      )}
    </div>
  );
}
