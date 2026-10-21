// The chat shell (v4.13) — the sheet, its grabber and its header.
//
// This is the frame, not the conversation: the drag lives here, the
// grabber and the header row are the drag surface, and the body is
// whatever the caller puts in it.
//
// Two sheets in one: the conversation, and (over it) the drawer of
// threads. The drawer is drawn by the caller and handed over.
import { useEffect } from "react";
import type { ReactNode } from "react";
import type { SheetDrag } from "./useSheetDrag";

interface Props {
  drag: SheetDrag;
  onClose: () => void;
  /** the left slot of the header — the threads button */
  left?: ReactNode;
  /** the right slot of the header — the new-thread button */
  right?: ReactNode;
  /** the body of the sheet */
  children: ReactNode;
  /** drawn over the sheet */
  drawer?: ReactNode;
}

export default function ChatSheet({
  drag,
  onClose,
  left,
  right,
  children,
  drawer,
}: Props) {
  // Escape closes the sheet — the sheet owns that key while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div data-testid="assistant-layer" className="chat-layer">
      <div
        ref={drag.backdropRef}
        className="chat-backdrop"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={drag.sheetRef}
        data-testid="assistant-sheet"
        className={`chat-sheet${drag.dragging ? " dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Assistant"
      >
        {/* The grabber and the header row are the drag surface. */}
        <div
          className="chat-grab"
          onPointerDown={drag.onPointerDown}
          style={{ touchAction: "none" }}
        >
          <button
            data-testid="assistant-grabber"
            className="chat-grabber"
            aria-label="Expand assistant"
            aria-expanded={drag.position === "full"}
            onClick={() => {
              if (drag.movedRef.current) return;
              drag.snapTo(drag.position === "full" ? "peek" : "full");
            }}
          />
          <div className="chat-header">
            <div className="chat-header-slot">{left}</div>
            <div className="chat-header-slot chat-header-right">{right}</div>
          </div>
        </div>
        <div className="chat-body">{children}</div>
        {drawer}
      </div>
    </div>
  );
}
