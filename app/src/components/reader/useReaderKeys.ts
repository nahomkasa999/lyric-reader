// The keys of the reader (v4.13).
//
// The keyboard is the reader's second language: the arrows step, the
// space toggles the auto-scroll, Escape unwinds the overlays from the
// top down. While an overlay is open it owns the keys — a key press
// must never step the sentence underneath a card.
import { useEffect } from "react";
import type { GestureDeps } from "./readerGestures";

/** Listen for the keys on the window. */
export function useReaderKeys(deps: GestureDeps): void {
  useEffect(() => {
    // The keys belong to the reader — before the page exists there is
    // nothing to step.
    if (!deps.stageRef.current) return;
    const onKey = (e: KeyboardEvent) => {
      // Overlays own their keys. Escape unwinds topmost-first; any other
      // key is swallowed while a selection, a meaning card, the outline,
      // the saved-word preview or the assistant sheet is open.
      if (deps.selRef.current) {
        if (e.key === "Escape") deps.collapseSelection();
        return;
      }
      if (deps.meaningRef.current) {
        if (e.key === "Escape") deps.closeMeaning();
        return;
      }
      if (deps.vocabPreviewRef.current) {
        if (e.key === "Escape") deps.closeVocabPreview();
        return;
      }
      if (deps.outlineOpenRef.current) {
        if (e.key === "Escape") deps.closeOutline();
        return;
      }
      if (deps.assistantOpenRef.current) return;
      if (deps.popRef.current) {
        if (e.key === "Escape") deps.closePop();
        return;
      }
      if (deps.editingRef.current) return; // the page field owns its keys
      // Space toggles auto-scroll (it no longer steps forward).
      if (e.key === " ") {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
        e.preventDefault();
        deps.toggleAuto();
        return;
      }
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowRight" ||
        e.key === "PageDown"
      ) {
        e.preventDefault();
        deps.goRef.current(1);
      } else if (
        e.key === "ArrowUp" ||
        e.key === "ArrowLeft" ||
        e.key === "PageUp"
      ) {
        e.preventDefault();
        deps.goRef.current(-1);
      } else if (e.key === "Escape") {
        deps.hideChrome();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    deps.book,
    deps.closePop,
    deps.collapseSelection,
    deps.closeMeaning,
    deps.closeVocabPreview,
    deps.closeOutline,
    deps.toggleAuto,
    deps.hideChrome,
  ]);
}
