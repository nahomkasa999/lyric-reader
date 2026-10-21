// Selecting (v4.13): the long-press, and the drag that extends it.
//
// The native selection is never created — Android's Define/Copy toolbar
// would appear over the book. The selection is painted with the CSS
// Custom Highlight API instead, and a long-press starts it.
import { useEffect } from "react";
import { extendSelection, wordRangeAt } from "../../lib/selection";
import type { GestureDeps, GestureShared } from "./readerGestures";

/** Attach the selection handlers to the stage. */
export function useReaderSelectionGestures(
  deps: GestureDeps,
  shared: GestureShared,
): void {
  useEffect(() => {
    const stage = deps.stageRef.current;
    if (!stage) return;
    const { selRef, lpRef, extendRef, selRangeRef, posRef } = deps;

    /** The element of the current item — the selection stays inside it. */
    const curItemEl = () => {
      const track = deps.stageRef.current?.querySelector<HTMLElement>(
        `[data-item="${posRef.current.item}"]`,
      );
      return track ?? null;
    };

    const fireLongPress = (x: number, y: number) => {
      lpRef.current = null;
      const scope = curItemEl();
      if (!scope) return;
      deps.raiseCustomSelection(wordRangeAt(x, y, scope));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (deps.popRef.current || deps.meaningRef.current) return;
      if (deps.assistantOpenRef.current) return;
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
        if (r) deps.raiseCustomSelection(r);
      }
    };

    const onPointerUp = () => {
      // Only a selection that actually STARTED (long-press fired and/or a
      // drag is in flight) suppresses the click that follows. A plain tap
      // — long-press timer still pending — must keep its normal click
      // behavior (double-tap opens the popup, taps step).
      const hadGesture = extendRef.current !== null || selRef.current !== null;
      if (lpRef.current) {
        window.clearTimeout(lpRef.current.timer);
        lpRef.current = null;
      }
      if (extendRef.current) extendRef.current = null;
      // The synthetic click that can follow a selection gesture must
      // never step or open the action popup.
      if (hadGesture) shared.lastSelEnd.current = Date.now();
    };

    const onPointerCancel = () => {
      if (lpRef.current) {
        window.clearTimeout(lpRef.current.timer);
        lpRef.current = null;
      }
      extendRef.current = null;
    };

    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointercancel", onPointerCancel);
    return () => {
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [deps.book, deps.raiseCustomSelection]);
}
