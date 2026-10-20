// The reader's bottom chrome (v4.7).
//
// Two parts, one look: the page rail («, ‹, ›, ») and the floating
// cluster above it — Ask (?), auto-scroll (▶/⏸) and the voice (speaker).
// All of them show and hide with the rest of the chrome.
import { useRef } from "react";
import { PlayIcon, PauseIcon, SpeakerIcon, StopIcon } from "./icons";

interface Props {
  /** the chrome is on screen */
  visible: boolean;
  onReveal: () => void;
  onPrevSection: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onNextSection: () => void;
  onAsk: () => void;
  autoPlaying: boolean;
  onToggleAuto: () => void;
  /** long-press on the auto button cycles the speed */
  onCycleSpeed: () => void;
  speedFlash: string | null;
  speaking: boolean;
  canSpeak: boolean;
  onToggleSpeak: () => void;
}

export default function ReaderControls({
  visible,
  onReveal,
  onPrevSection,
  onPrevPage,
  onNextPage,
  onNextSection,
  onAsk,
  autoPlaying,
  onToggleAuto,
  onCycleSpeed,
  speedFlash,
  speaking,
  canSpeak,
  onToggleSpeak,
}: Props) {
  // Long-press on the auto button = speed cycle, tap = play/pause.
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const longPressed = useRef(false);

  const cancelPress = () => {
    if (press.current) {
      window.clearTimeout(press.current.timer);
      press.current = null;
    }
  };

  return (
    <>
      <nav
        data-bottom-nav
        data-testid="bottom-nav"
        className={`bottom-nav${visible ? " show" : ""}`}
        aria-label="Page navigation"
        onFocus={onReveal}
        onPointerDown={onReveal}
      >
        <button
          data-testid="nav-prev-section"
          onClick={onPrevSection}
          aria-label="Previous section"
        >
          «
        </button>
        <button
          data-testid="nav-prev-page"
          onClick={onPrevPage}
          aria-label="Previous page"
        >
          ‹
        </button>
        <button
          data-testid="nav-next-page"
          onClick={onNextPage}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          data-testid="nav-next-section"
          onClick={onNextSection}
          aria-label="Next section"
        >
          »
        </button>
      </nav>

      {/* Ask — a ghost button that joins the unified auto-hiding chrome. */}
      <button
        data-testid="ask-btn"
        aria-label="Ask about this passage"
        className={`ask-btn${visible ? " show" : ""}`}
        onClick={onAsk}
      >
        ?
      </button>

      {/* The voice: tap to hear this sentence, tap again to stop it. */}
      {canSpeak && (
        <button
          data-testid="speak-btn"
          aria-label={speaking ? "Stop reading" : "Read this sentence aloud"}
          className={`speak-btn${visible ? " show" : ""}${speaking ? " on" : ""}`}
          onClick={onToggleSpeak}
        >
          {speaking ? <StopIcon /> : <SpeakerIcon />}
        </button>
      )}

      {/* Auto-scroll play/pause — same cluster, next to the voice. */}
      <button
        data-testid="autoscroll-btn"
        aria-label={autoPlaying ? "Pause auto-scroll" : "Start auto-scroll"}
        className={`auto-btn${visible ? " show" : ""}`}
        onPointerDown={(e) => {
          longPressed.current = false;
          press.current = {
            x: e.clientX,
            y: e.clientY,
            timer: window.setTimeout(() => {
              press.current = null;
              longPressed.current = true;
              onCycleSpeed();
            }, 500),
          };
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
            window.clearTimeout(p.timer);
            press.current = null;
          }
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          // A long-press must not also toggle.
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onToggleAuto();
        }}
      >
        {autoPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Transient speed label after a long-press cycle. */}
      {speedFlash && (
        <span data-testid="autoscroll-speed" className="auto-speed show">
          {speedFlash}
        </span>
      )}
    </>
  );
}
