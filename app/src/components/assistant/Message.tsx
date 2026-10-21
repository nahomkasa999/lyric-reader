// One message of the conversation (v4.13).
//
// The reader's question is a bubble on the right; the answer is plain
// text on the left, with no bubble at all — the way the reference
// reads. The sources hang under the answer.
//
// Tap a message and it offers what a reader wants with a message they
// have already read: copy it, and — for a question — change it or take
// it back.
import { useEffect, useState } from "react";
import type { AssistantMessage } from "../../lib/assistantStore";
import Markdown from "./Markdown";
import Sources from "./Sources";

interface Props {
  message: AssistantMessage;
  onJump: (bookId: string, item: number) => void;
  /** this message is being rewritten */
  editing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (text: string) => void;
  /** take the message back */
  onRemove?: () => void;
}

export default function Message({
  message,
  onJump,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(message.text);

  useEffect(() => {
    setDraft(message.text);
  }, [message.text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      /* the reader can still select the text */
    }
    setOpen(false);
  };

  if (message.role === "user") {
    if (editing) {
      return (
        <div className="chat-edit">
          <textarea
            data-testid="assistant-edit-text"
            className="chat-edit-area"
            value={draft}
            rows={3}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Edit your question"
          />
          <div className="chat-edit-actions">
            <button
              data-testid="assistant-edit-cancel"
              onClick={onCancelEdit}
            >
              Cancel
            </button>
            <button
              data-testid="assistant-edit-send"
              onClick={() => onSaveEdit?.(draft.trim())}
              disabled={!draft.trim()}
            >
              Send again
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="chat-msg-wrap">
        <div
          data-testid="assistant-question"
          className="chat-user"
          onClick={() => setOpen((o) => !o)}
        >
          {message.text}
        </div>
        {open && (
          <div className="chat-msg-actions">
            <button data-testid="assistant-edit" onClick={onStartEdit}>
              Edit
            </button>
            <button data-testid="assistant-copy" onClick={() => void copy()}>
              Copy
            </button>
            {onRemove && (
              <button data-testid="assistant-remove" onClick={onRemove}>
                Take back
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-testid="assistant-answer" className="chat-ai">
      <Markdown text={message.text} />
      <div className="chat-msg-actions">
        <button data-testid="assistant-copy" onClick={() => void copy()}>
          Copy answer
        </button>
      </div>
      <Sources sources={message.sources ?? []} onJump={onJump} />
    </div>
  );
}
