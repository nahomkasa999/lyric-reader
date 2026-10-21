// The threads drawer (v4.13).
//
// The threads used to be a row of chips under the header — the part
// that felt worst. They live in a drawer now: it slides in from the
// left over the sheet, and every row is a conversation with its title,
// when it was last used, and a way to forget it.
import { threadTitle, type Thread } from "../../lib/assistantStore";

interface Props {
  threads: Thread[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** When was this thread last used? "today", "yesterday", "3 days ago". */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const day = 86_400_000;
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOf(now) - startOf(ts)) / day);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ThreadDrawer({
  threads,
  currentId,
  onSelect,
  onDelete,
  onClose,
}: Props) {
  return (
    <div
      data-testid="assistant-drawer"
      className="chat-drawer"
      role="dialog"
      aria-label="Conversations"
    >
      <div className="chat-drawer-head">
        <span>Conversations</span>
        <button
          className="chat-iconbtn"
          style={{ marginLeft: "auto" }}
          aria-label="Close conversations"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="chat-drawer-list">
        {threads.length === 0 && (
          <div className="chat-drawer-empty">
            <p className="chat-drawer-empty-title">Starting conversations</p>
            <p>Ask something — every question you ask opens a thread.</p>
          </div>
        )}
        {threads.map((t) => (
          <div
            key={t.id}
            className={`chat-drawer-row${t.id === currentId ? " active" : ""}`}
          >
            <button
              data-testid={`assistant-thread-${t.id}`}
              className="chat-drawer-title"
              onClick={() => {
                onSelect(t.id);
                onClose();
              }}
            >
              {threadTitle(t)}
            </button>
            <span className="chat-drawer-time">{relativeTime(t.updatedAt)}</span>
            <button
              className="chat-drawer-del"
              aria-label={`Delete ${threadTitle(t)}`}
              onClick={() => onDelete(t.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
