// The drag of the assistant sheet (v4.13).
//
// The sheet rests in two places — peek (the page behind is still
// visible) and full (the conversation owns the screen) — and it can be
// dragged to either. The finger follows the sheet 1:1; on release the
// sheet snaps to the nearest place, or goes the way it was flicked.
//
// The numbers here are not improvised: peek is 62% of the screen, the
// close threshold is 96px below peek, a flick is 0.5 px/ms, and the
// sheet only starts moving after 4px of travel — so a tap on the
// header never nudges it.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/** How much of the screen the sheet covers when it peeks. */
export const PEEK_RATIO = 0.62;
/** How far below peek a downward drag has to go to close the sheet. */
export const CLOSE_THRESHOLD = 96;
/** How far the finger must travel before the sheet follows it. */
export const ARM_THRESHOLD = 4;
/** A flick is this fast, in pixels per millisecond. */
export const FLICK = 0.5;
/** How long a snap takes. */
export const SNAP_MS = 260;

export type SheetPos = "full" | "peek" | "closed";

/** Where the sheet rests, in pixels from the top of the screen. */
export function restOf(pos: SheetPos): number {
  const h = window.innerHeight;
  if (pos === "full") return 0;
  if (pos === "closed") return h;
  return h * (1 - PEEK_RATIO);
}

/** The backdrop is dark at full, lighter at peek, gone when closed. */
export function backdropOf(y: number): number {
  const peek = restOf("peek");
  const close = restOf("closed");
  const t = y <= peek ? 1 - y / peek : -(y - peek) / Math.max(1, close - peek);
  return Math.max(0, 0.35 + 0.65 * Math.max(-1, Math.min(1, t)));
}

export interface SheetDrag {
  /** the sheet element — the drag writes the transform on it */
  sheetRef: RefObject<HTMLDivElement | null>;
  /** the backdrop element */
  backdropRef: RefObject<HTMLDivElement | null>;
  /** where the sheet rests now */
  position: SheetPos;
  /** the finger is on the sheet */
  dragging: boolean;
  /** true right after a drag — a click that follows must be ignored */
  movedRef: RefObject<boolean>;
  /** start a drag — put this on the grabber and the header row */
  onPointerDown: (e: ReactPointerEvent) => void;
  /** go to a resting place */
  snapTo: (pos: SheetPos) => void;
}

interface DragState {
  /** where the sheet was when the finger went down */
  y0: number;
  startY: number;
  startT: number;
  lastY: number;
  lastT: number;
  moved: boolean;
}

export function useSheetDrag(onClose: () => void): SheetDrag {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const yRef = useRef(0);
  const drag = useRef<DragState | null>(null);
  const movedRef = useRef(false);
  const [position, setPosition] = useState<SheetPos>("peek");
  const [dragging, setDragging] = useState(false);

  /** Put the sheet at a place, right now. */
  const apply = useCallback((y: number) => {
    yRef.current = y;
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transform = `translate3d(0, ${y}px, 0)`;
    const backdrop = backdropRef.current;
    if (backdrop) backdrop.style.opacity = String(backdropOf(y));
  }, []);

  /** Go to a resting place, with the snap. */
  const snapTo = useCallback(
    (pos: SheetPos) => {
      const y = restOf(pos);
      setDragging(false);
      apply(y);
      setPosition(pos);
      if (pos === "closed") onClose();
    },
    [apply, onClose],
  );

  /** The sheet opens at peek. */
  useEffect(() => {
    const y = restOf("peek");
    apply(y);
    setPosition("peek");
  }, [apply]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = e.currentTarget as HTMLElement;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* the capture is a nicety, not a requirement */
      }
      drag.current = {
        y0: yRef.current,
        startY: e.clientY,
        startT: e.timeStamp,
        lastY: e.clientY,
        lastT: e.timeStamp,
        moved: false,
      };
      movedRef.current = false;
      setDragging(true);
    },
    [],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;
      if (!d.moved && Math.abs(e.clientY - d.startY) < ARM_THRESHOLD) return;
      d.moved = true;
      const raw = d.y0 + (e.clientY - d.startY);
      const close = restOf("closed");
      // Rubber band: the sheet resists above full and below closed.
      let y = raw;
      if (raw < 0) y = raw * 0.25;
      else if (raw > close) y = close + (raw - close) * 0.25;
      apply(y);
    };

    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      movedRef.current = d.moved;
      if (!d.moved) {
        setDragging(false);
        return;
      }
      const peek = restOf("peek");
      const span = Math.max(1, d.lastT - d.startT);
      const velocity = (d.lastY - d.startY) / span;
      if (velocity > FLICK) {
        // Flicked down: peek closes, full drops back to peek.
        snapTo(yRef.current <= peek + 1 ? "closed" : "peek");
      } else if (velocity < -FLICK) {
        snapTo("full");
      } else if (yRef.current > peek + CLOSE_THRESHOLD) {
        snapTo("closed");
      } else {
        snapTo(yRef.current < peek / 2 ? "full" : "peek");
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [apply, snapTo]);

  return {
    sheetRef,
    backdropRef,
    position,
    dragging,
    movedRef,
    onPointerDown,
    snapTo,
  };
}
