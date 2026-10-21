// Stepping (v4.13): the wheel, the swipe, the click and the keys.
//
// This is the reader's own mechanics: one sentence per step, the hot
// zones that reveal the chrome instead of stepping, and the overlays
// that swallow every step while they are open.
import { useEffect } from "react";
import type { GestureDeps, GestureShared } from "./readerGestures";

/** Attach the stepping handlers to the stage. */
export function useReaderStepping(
  deps: GestureDeps,
  shared: GestureShared,
): void {
  useEffect(() => {
    const stage = deps.stageRef.current;
    if (!stage) return;
    const {
      selRef,
      meaningRef,
      assistantOpenRef,
      outlineOpenRef,
      vocabPreviewRef,
      lpRef,
      extendRef,
      posRef,
      partsRef,
      vocabRef,
      goRef,
      suppressUntil,
    } = deps;
    let wlock = false;
    let wt = 0;
    let ty = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // While a selection is active, a meaning card is open, or the
      // assistant sheet is open, every stepping input is suppressed.
      if (
        selRef.current ||
        meaningRef.current ||
        assistantOpenRef.current ||
        outlineOpenRef.current ||
        vocabPreviewRef.current ||
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
      shared.moved.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (shared.moved.current) return;
      // A touch-drag that is actually selecting text must not step.
      if (
        selRef.current ||
        meaningRef.current ||
        assistantOpenRef.current ||
        outlineOpenRef.current ||
        vocabPreviewRef.current ||
        lpRef.current ||
        extendRef.current
      )
        return;
      const dy = ty - e.touches[0].clientY;
      if (Math.abs(dy) > 30) {
        goRef.current(dy > 0 ? 1 : -1);
        shared.moved.current = true;
      }
    };

    const onClick = (e: MouseEvent) => {
      // The click that follows a swallowed tap-outside popup dismissal must
      // not step, select, or reveal chrome.
      if (Date.now() < suppressUntil.current) return;
      // The synthetic click that can follow a long-press/drag selection
      // gesture must never step or open the action popup.
      if (Date.now() - shared.lastSelEnd.current < 600) return;
      if (shared.moved.current) {
        shared.moved.current = false;
        return;
      }
      const t = e.target as HTMLElement;
      // Hot zones: taps at the top ~12% or bottom 15% of the stage reveal
      // the chrome instead of stepping — never advance here.
      const stageRect = stage.getBoundingClientRect();
      if (e.clientY - stageRect.top < stageRect.height * 0.12) {
        deps.showChrome();
        return;
      }
      // Bottom hot-zone: reveal the chrome instead of stepping.
      if (e.clientY > window.innerHeight * 0.85) {
        deps.showChrome();
        return;
      }
      const s = t.closest("[data-item]");
      if (!s) return;
      const i = Number(s.getAttribute("data-item"));
      const cur = posRef.current;
      const pl = partsRef.current;
      // A tap on a saved word (the dotted ones) shows what it means. It
      // never steps the sentence and never opens the card.
      const voc = t.closest?.(".voc") as HTMLElement | null;
      if (voc) {
        const norm = (voc.textContent ?? "").trim().toLowerCase();
        const rec = vocabRef.current.find((v) => v.norm === norm);
        const vp = voc.closest("[data-p]") as HTMLElement | null;
        if (rec && vp) {
          deps.openVocabPreview(
            rec,
            voc,
            i,
            Number(vp.getAttribute("data-p")),
          );
          return;
        }
      }
      if (i !== cur.item) {
        // Adjacent item: jump to it (forward = part 0, back = last part).
        if (Math.abs(i - cur.item) === 1) {
          const fwd = i > cur.item;
          deps.closePop();
          deps.setPos({ item: i, part: fwd ? 0 : pl[i].length - 1 });
        }
        return;
      }
      const sp = t.closest("[data-p]");
      const p = sp ? Number(sp.getAttribute("data-p")) : cur.part;
      const key = `${cur.item}:${cur.part}`;
      const now = Date.now();
      if (p !== cur.part) {
        // Click the muted half of a split sentence: activate that half.
        deps.setPos({ item: cur.item, part: p });
        shared.lastTap.current = { t: now, key: `${cur.item}:${p}` };
        return;
      }
      // Double-tap the active part — or any tap on a single-part
      // sentence — opens the action popup.
      if (
        pl[cur.item].length === 1 ||
        (now - shared.lastTap.current.t < 350 &&
          shared.lastTap.current.key === key)
      ) {
        deps.openPop(cur.item, cur.part);
        shared.lastTap.current.t = 0;
      } else {
        shared.lastTap.current = { t: now, key };
      }
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchmove", onTouchMove, { passive: true });
    stage.addEventListener("click", onClick);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("click", onClick);
    };
    // `book` in deps: the effect must (re-)attach once the stage exists
    // after the book loads — on first render we bail out at `!stage`.
  }, [
    deps.book,
    deps.closePop,
    deps.openPop,
    deps.showChrome,
    deps.openVocabPreview,
  ]);
}
