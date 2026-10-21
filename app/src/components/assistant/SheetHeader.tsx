// The header of the assistant sheet (v4.13).
//
// Two buttons: the threads on the left, a new thread on the right. The
// new thread is an ICON ONLY — a pencil in a square — because a chip
// row of "New thread" labels was the part of the old sheet that felt
// worst.
interface ButtonProps {
  /** the buttons are not the drag surface */
  onPointerDown?: (e: { stopPropagation: () => void }) => void;
}

function noDrag(e: { stopPropagation: () => void }): void {
  e.stopPropagation();
}

export function ThreadsButton({
  onOpenThreads,
  ...rest
}: ButtonProps & { onOpenThreads: () => void }) {
  return (
    <button
      data-testid="assistant-menu"
      className="chat-iconbtn"
      aria-label="Threads"
      onPointerDown={rest.onPointerDown ?? noDrag}
      onClick={onOpenThreads}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M4 7h16M4 12h16M4 17h16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export function NewThreadButton({
  onNewThread,
  ...rest
}: ButtonProps & { onNewThread: () => void }) {
  return (
    <button
      data-testid="assistant-new-thread"
      className="chat-iconbtn"
      aria-label="New thread"
      onPointerDown={rest.onPointerDown ?? noDrag}
      onClick={onNewThread}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx="4"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
        />
        <path
          d="M12 8.5v7M8.5 12h7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
