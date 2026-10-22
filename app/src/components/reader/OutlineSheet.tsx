// Outline: the book's chapters, in a sheet over the reader.
//
// Tap a chapter → the reader jumps there. The ✕ (or a tap outside, or a
// swipe down) closes the sheet and the reader is exactly where it was —
// the outline never moves you unless you pick a chapter.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "../../lib/types";
import {
  buildOutline,
  filterOutline,
  outlineIndexAt,
} from "../../lib/outline";

interface Props {
  items: Item[];
  /** the item the reader is on */
  current: number;
  /** jump to a chapter */
  onJump: (item: number) => void;
  /** close the sheet — the reader stays where it is */
  onClose: () => void;
}

export default function OutlineSheet({
  items,
  current,
  onJump,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const touchY = useRef<number | null>(null);

  const outline = useMemo(() => buildOutline(items), [items]);
  const shown = useMemo(
    () => filterOutline(outline, query),
    [outline, query],
  );
  const here = outlineIndexAt(outline, current);

  // Open on the chapter the reader is in.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>("[data-current='true']");
    if (el) el.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div
      data-testid="outline-layer"
      className="outline-layer"
      onClick={(e) => {
        // A tap on the backdrop closes the sheet; taps on the sheet pass.
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        // Only a swipe that STARTS on the header zone dismisses — a fling
        // inside the list must just scroll.
        const sheet = (e.currentTarget as HTMLElement).querySelector(
          ".outline-sheet",
        );
        const r = sheet?.getBoundingClientRect();
        const y = e.touches[0].clientY;
        touchY.current = r && y - r.top < 110 ? y : null;
      }}
      onTouchEnd={(e) => {
        if (touchY.current == null) return;
        const dy = e.changedTouches[0].clientY - touchY.current;
        touchY.current = null;
        if (dy > 90) onClose();
      }}
    >
      <div
        data-testid="outline-sheet"
        className="outline-sheet"
        role="dialog"
        aria-label="Outline"
      >
        <div className="outline-header">
          <div className="outline-head-text">
            <div className="outline-title">Outline</div>
            <div className="outline-sub">
              {outline.length} {outline.length === 1 ? "section" : "sections"}
              {outline.length && outline[0].kind === "page"
                ? " — this book has no headings"
                : ""}
            </div>
          </div>
          <button
            data-testid="outline-close"
            onClick={onClose}
            aria-label="Back to the reader"
            className="outline-x"
          >
            ✕
          </button>
        </div>

        {outline.length > 8 && (
          <div className="outline-filter">
            <input
              data-testid="outline-filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter chapters…"
              aria-label="Filter chapters"
              className="outline-input"
            />
          </div>
        )}

        <div ref={listRef} className="outline-list" data-testid="outline-list">
          {shown.length === 0 ? (
            <p className="outline-empty">Nothing matches “{query}”.</p>
          ) : (
            shown.map((e) => {
              const idx = outline.indexOf(e);
              const isHere = idx === here;
              return (
                <button
                  key={e.item}
                  data-testid={`outline-entry-${idx}`}
                  data-current={isHere ? "true" : undefined}
                  className={`outline-row${isHere ? " cur" : ""}`}
                  style={{ paddingLeft: 14 + (e.level - 1) * 16 }}
                  onClick={() => {
                    onJump(e.item);
                    onClose();
                  }}
                >
                  <span className="outline-row-text">
                    <span className="outline-row-title">{e.text}</span>
                    {e.hint && <span className="outline-row-hint">{e.hint}</span>}
                  </span>
                  <span className="outline-row-page">{e.page}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
