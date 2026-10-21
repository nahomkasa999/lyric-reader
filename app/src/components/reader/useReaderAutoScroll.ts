// The auto-scroll (v4.13): the book reads itself, part by part.
//
// One timer, always cleared before it is re-armed, so rapid toggles can
// never stack timers. The playback pauses for the overlays (the popup,
// the selection, the meaning card, the assistant sheet) and picks up
// again when they close — unless the reader left for good.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { nextAutoStep, nextSpeed, paceMs } from "../../lib/autoscroll";
import type { Position } from "../../lib/types";

export interface AutoScrollOptions {
  /** the parts of the book, per item */
  partsRef: RefObject<string[][]>;
  /** where the reader is */
  posRef: RefObject<Position>;
  /** the current item and part — the timer is re-armed for them */
  item: number;
  part: number;
  /** the overlays that hold the playback */
  popRef: RefObject<object | null>;
  selRef: RefObject<object | null>;
  meaningRef: RefObject<object | null>;
  assistantOpenRef: RefObject<boolean>;
  outlineOpenRef: RefObject<boolean>;
  vocabPreviewRef: RefObject<object | null>;
  /** where the reader goes */
  setPos: (p: Position) => void;
  /** the speed label after a long-press */
  setSpeedFlash: (v: string | null) => void;
  /** the chrome goes away when the book reads itself */
  hideChrome: () => void;
  /** anything that moves closes the overlays */
  closeReadingOverlays: () => void;
  /** the speed, and the setter */
  speed: number;
  updateSpeed: (v: number) => void;
  /** a new book starts paused */
  bookId: string;
  /** the two callbacks the overlays call */
  maybeResumeAutoRef: RefObject<() => void>;
  pauseAutoTransientRef: RefObject<() => void>;
}

export interface AutoScroll {
  /** the book is reading itself */
  playing: boolean;
  /** the pause is given back when the overlay closes */
  maybeResumeAuto: () => void;
  /** the playback holds for an overlay */
  pauseAutoTransient: () => void;
  /** stop, no resume */
  stopHard: () => void;
  /** play or pause */
  toggle: () => void;
  /** long-press: cycle the speed */
  cycleSpeed: () => void;
  /** a card takes the pause: it is given back when the card closes */
  holdForCard: () => void;
}

export function useReaderAutoScroll(opts: AutoScrollOptions): AutoScroll {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);
  const resume = useRef(false);
  const speed = useRef(opts.speed);
  speed.current = opts.speed;
  const flashTimer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const arm = useCallback(() => {
    clearTimer();
    const { item, part } = opts.posRef.current;
    const text = opts.partsRef.current[item]?.[part] ?? "";
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (!playing) return;
      // Safety: an overlay that somehow opened without pausing playback
      // must never advance underneath it.
      if (
        opts.popRef.current ||
        opts.selRef.current ||
        opts.meaningRef.current ||
        opts.assistantOpenRef.current ||
        opts.outlineOpenRef.current ||
        opts.vocabPreviewRef.current
      )
        return;
      const step = nextAutoStep(opts.partsRef.current, opts.posRef.current);
      if ("end" in step) {
        // End of book: stop, icon back to ▶.
        setPlaying(false);
        return;
      }
      opts.setPos(step.next);
    }, paceMs(text, speed.current));
  }, [clearTimer, opts, playing]);

  const start = useCallback(() => {
    if (playing) {
      arm();
      return;
    }
    opts.closeReadingOverlays();
    resume.current = false;
    setPlaying(true);
    // Manners: starting playback hides the chrome — full focus.
    opts.hideChrome();
    arm();
  }, [arm, opts, playing]);

  const stop = useCallback(() => {
    clearTimer();
    setPlaying(false);
  }, [clearTimer]);

  /** Hard stop: pause with no resume (leaving the reader, Settings, tab). */
  const stopHard = useCallback(() => {
    resume.current = false;
    clearTimer();
    setPlaying(false);
  }, [clearTimer]);

  const toggle = useCallback(() => {
    if (playing) stop();
    else start();
  }, [playing, start, stop]);

  /** Transient pause for popup/selection/meaning/sheet: resume on close. */
  const pauseAutoTransient = useCallback(() => {
    if (!playing) return;
    clearTimer();
    resume.current = true;
    setPlaying(false);
  }, [clearTimer, playing]);

  const maybeResumeAuto = useCallback(() => {
    if (!resume.current) return;
    resume.current = false;
    setPlaying(true);
    arm();
  }, [arm]);

  /** A card takes the pause — and gives it back when it closes. */
  const holdForCard = useCallback(() => {
    resume.current = false;
    clearTimer();
    if (playing) {
      resume.current = true;
      setPlaying(false);
    }
  }, [clearTimer, playing]);

  /** Long-press the auto button: cycle the speed, show the label briefly. */
  const cycleSpeed = useCallback(() => {
    const ns = nextSpeed(speed.current);
    opts.updateSpeed(ns);
    opts.setSpeedFlash(`${ns}×`);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(
      () => opts.setSpeedFlash(null),
      1400,
    );
  }, [opts]);

  // The overlays call these through their refs.
  opts.maybeResumeAutoRef.current = maybeResumeAuto;
  opts.pauseAutoTransientRef.current = pauseAutoTransient;

  // Manual steps while playing re-arm the timer for the new part.
  useEffect(() => {
    if (playing) arm();
  }, [opts.item, opts.part, playing, arm]);

  // Speed changes mid-playback re-time the current part.
  useEffect(() => {
    if (playing) arm();
  }, [opts.speed, arm]);

  // New book: stay paused.
  useEffect(() => {
    stopHard();
  }, [opts.bookId, stopHard]);

  // Tab/app switch: pause with no resume.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stopHard();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stopHard]);

  useEffect(
    () => () => {
      clearTimer();
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [clearTimer],
  );

  return {
    playing,
    maybeResumeAuto,
    pauseAutoTransient,
    stopHard,
    toggle,
    cycleSpeed,
    holdForCard,
  };
}
