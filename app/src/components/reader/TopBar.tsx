// The reader's top bar (v4.7).
//
// It used to carry: a "← Library" button, "Page 14 / 222 · 4%", A−, A+,
// a saved icon and a gear — six things, all fighting for the same strip.
// Now it carries three: where you came from, where you are, and a menu.
//
//   [←]              14 / 222              [⋯]
//
// The page number stays editable (tap it, type a page). Everything else —
// text size, saved marks, settings — lives behind the overflow menu.
import { useEffect, useRef, useState } from "react";
import {
  ArrowIcon,
  ChatIcon,
  GearIcon,
  MoreIcon,
  SavedIcon,
  SpeakerIcon,
} from "./icons";

interface Props {
  /** current page, 1-based */
  page: number;
  /** total pages */
  pages: number;
  /** jump to a page, 1-based */
  onJumpPage: (page: number) => void;
  onBack: () => void;
  onOpenSaved: () => void;
  onOpenSettings: () => void;
  /** open the assistant (ask the whole library) */
  onOpenAssistant: () => void;
  /** open the voice picker (choose the voice that reads) */
  onOpenVoice: () => void;
  /** −2 / +2 px on the reading size */
  onTextSize: (delta: number) => void;
  /** keep the chrome awake (the bar auto-hides) */
  onReveal: () => void;
  /** the page field is being edited — the bar must not hide */
  onEditingChange?: (editing: boolean) => void;
  /** a swallowed tap (popup dismissal) must not start editing */
  blocked?: () => boolean;
  /** the chrome is on screen */
  visible: boolean;
  /** the overflow menu */
  menuOpen: boolean;
  onMenuToggle: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

export default function TopBar({
  page,
  pages,
  onJumpPage,
  onBack,
  onOpenSaved,
  onOpenSettings,
  onOpenAssistant,
  onOpenVoice,
  onTextSize,
  onReveal,
  onEditingChange,
  blocked,
  visible,
  menuOpen,
  onMenuToggle,
  menuRef,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(String(page));
  // Escape cancels the edit — the blur it triggers must not commit.
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setEditVal(String(page));
  }, [page, editing]);

  const stopEditing = (value: boolean) => {
    setEditing(value);
    onEditingChange?.(value);
  };

  return (
    <header
      data-topbar
      data-testid="top-bar"
      className={`reader-bar shrink-0${visible ? "" : " chrome-hidden"}`}
      style={{ paddingTop: "calc(10px + env(safe-area-inset-top))" }}
      onFocus={onReveal}
      onPointerDown={onReveal}
    >
      <button
        data-testid="back-btn"
        className="bar-icon"
        aria-label="Back to library"
        onClick={onBack}
      >
        <ArrowIcon />
      </button>

      <span className="page-label" data-testid="page-label">
        <input
          data-testid="page-input"
          className="page-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Page number"
          value={editVal}
          onFocus={(e) => {
            if (blocked?.()) {
              e.target.blur();
              return;
            }
            stopEditing(true);
            e.target.select();
          }}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => {
            if (cancelled.current) {
              cancelled.current = false;
              return;
            }
            const v = parseInt(editVal, 10);
            if (Number.isFinite(v)) onJumpPage(Math.min(pages, Math.max(1, v)));
            else setEditVal(String(page));
            stopEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            else if (e.key === "Escape") {
              cancelled.current = true;
              setEditVal(String(page));
              stopEditing(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="page-total">/ {pages}</span>
      </span>

      <button
        data-testid="reader-menu-btn"
        className="bar-icon"
        aria-label="More options"
        aria-expanded={menuOpen}
        onClick={onMenuToggle}
      >
        <MoreIcon />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          className="reader-menu"
          data-testid="reader-menu"
          role="menu"
          aria-label="Reader menu"
        >
          <div className="menu-row menu-row-static">
            <span className="menu-label">Text size</span>
            <span className="menu-size">
              <button
                data-testid="font-smaller"
                aria-label="Smaller text"
                onClick={() => onTextSize(-2)}
              >
                A−
              </button>
              <button
                data-testid="font-larger"
                aria-label="Larger text"
                onClick={() => onTextSize(2)}
              >
                A+
              </button>
            </span>
          </div>
          <button
            className="menu-row"
            data-testid="voice-btn"
            onClick={onOpenVoice}
          >
            <SpeakerIcon />
            <span>Voice</span>
          </button>
          <button
            className="menu-row"
            data-testid="assistant-btn"
            onClick={onOpenAssistant}
          >
            <ChatIcon />
            <span>Assistant</span>
          </button>
          <button
            className="menu-row"
            data-testid="saved-btn"
            onClick={onOpenSaved}
          >
            <SavedIcon />
            <span>Saved marks</span>
          </button>
          <button
            className="menu-row"
            data-testid="settings-gear"
            onClick={onOpenSettings}
          >
            <GearIcon />
            <span>Settings</span>
          </button>
        </div>
      )}
    </header>
  );
}
