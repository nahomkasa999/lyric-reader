// The sources of an answer (v4.12).
//
// Where the answer came from: the book, the section and the page. Tap
// one and the reader opens at that exact place — the whole point of
// asking a question is being able to go and read it.
import type { Source } from "../lib/assistantStore";

interface Props {
  sources: Source[];
  onJump: (bookId: string, item: number) => void;
}

export default function AssistantSources({ sources, onJump }: Props) {
  if (!sources.length) return null;
  return (
    <div
      data-testid="assistant-sources"
      className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2"
    >
      {sources.map((s, i) => (
        <button
          key={`${s.bookId}-${s.page}-${i}`}
          data-testid={`assistant-source-${i}`}
          onClick={() => onJump(s.bookId, s.item)}
          className="press max-w-full truncate rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground"
        >
          {s.bookTitle}
          {s.heading ? ` · ${s.heading.slice(0, 22)}` : ""} · p.{s.page}
        </button>
      ))}
    </div>
  );
}
