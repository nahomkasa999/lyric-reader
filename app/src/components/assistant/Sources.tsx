// The sources of an answer (v4.13).
//
// The sources are part of the answer, always below it — never floating
// above the text. A chip is a place in a book: tap it and the reader
// opens there.
import type { Source } from "../../lib/assistantStore";

interface Props {
  sources: Source[];
  onJump: (bookId: string, item: number) => void;
}

/** How many chips are shown before the "+n" one. */
const MAX_CHIPS = 3;

export default function Sources({ sources, onJump }: Props) {
  if (!sources.length) return null;
  const shown = sources.slice(0, MAX_CHIPS);
  const rest = sources.length - shown.length;
  return (
    <div data-testid="assistant-sources" className="chat-sources">
      <div className="chat-hairline" />
      <p className="chat-sources-label">Sources · {sources.length}</p>
      <div className="chat-chips">
        {shown.map((s, i) => (
          <button
            key={`${s.bookId}:${s.item}:${i}`}
            data-testid={`assistant-source-${i}`}
            className="chat-chip"
            onClick={() => onJump(s.bookId, s.item)}
          >
            <span aria-hidden>📖</span>
            <span className="truncate">{s.bookTitle}</span>
            <span className="chat-chip-page">p.{s.page}</span>
          </button>
        ))}
        {rest > 0 && (
          <span data-testid="assistant-source-more" className="chat-chip chat-chip-more">
            +{rest}
          </span>
        )}
      </div>
    </div>
  );
}
