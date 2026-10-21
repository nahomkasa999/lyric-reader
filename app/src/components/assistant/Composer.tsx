// The composer (v4.13): the pill at the bottom of the sheet.
//
// One pill: the text on the left, the send button on the right. While
// the answer comes in the send button becomes a stop.
//
// Above the pill sits the strip that says how the indexing is going —
// it only appears when there is something to say.
import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** the answer is coming in */
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** the composer was focused — the sheet goes full */
  onFocus?: () => void;
  /** the strip above the pill */
  strip?: React.ReactNode;
}

/** Five lines is as tall as the composer gets. */
const MAX_HEIGHT = 120;

export default function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder = "Ask your library…",
  onFocus,
  strip,
}: Props) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // The textarea grows with the text, up to five lines. It is measured
  // from a collapsed box, so the height is always the height of the
  // text and never more.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <div className="chat-composer-wrap">
      {strip}
      <div className="chat-composer">
        <textarea
          ref={areaRef}
          data-testid="assistant-input"
          className="chat-input"
          value={value}
          rows={1}
          placeholder={placeholder}
          aria-label="Ask a question"
          disabled={disabled}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!streaming) onSend();
            }
          }}
        />
        {streaming ? (
          <button
            data-testid="assistant-stop"
            className="chat-send chat-stop"
            onClick={onStop}
            aria-label="Stop"
          >
            <span className="chat-stop-square" aria-hidden />
          </button>
        ) : (
          <button
            data-testid="assistant-send"
            className="chat-send"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            aria-label="Send"
          >
            ↑
          </button>
        )}
      </div>
    </div>
  );
}
