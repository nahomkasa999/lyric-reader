// The assistant sheet (v4.12).
//
// A conversation with the reader's own library. The question is matched
// against the knowledge base, the model answers only from the passages
// that were found, and every answer carries its sources — tap one and
// the reader opens at that exact page.
//
// The threads are the point: a new question that has nothing to do with
// the last one starts a new thread, so no conversation grows without
// bound.
import { useEffect, useRef } from "react";
import { splitQuotes } from "../lib/askContext";
import type { AssistantMessage } from "../lib/assistantStore";
import AssistantSources from "./AssistantSources";
import { threadTitle, useAssistant, type AssistantOptions } from "./useAssistant";

interface Props extends AssistantOptions {
  onClose: () => void;
  onJump: (bookId: string, item: number) => void;
  onOpenSettings: () => void;
}

export default function AssistantSheet({
  bookId,
  bookTitle,
  onClose,
  onJump,
  onOpenSettings,
}: Props) {
  const a = useAssistant({ bookId, bookTitle });
  const listRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [a.messages, a.sending]);

  const renderAnswer = (m: AssistantMessage, idx: number) => {
    const segs = splitQuotes(m.text);
    return (
      <div key={idx} data-testid="assistant-answer" className="ask-msg ai">
        {segs.map((s, i) =>
          s.kind === "text" ? (
            <span key={i}>{s.text}</span>
          ) : (
            <span key={i} className="ask-quote">
              «{s.text}»
            </span>
          ),
        )}
        <AssistantSources sources={m.sources ?? []} onJump={onJump} />
      </div>
    );
  };

  return (
    <div
      data-testid="assistant-layer"
      className="ask-layer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="assistant-sheet"
        className="ask-sheet"
        role="dialog"
        aria-label="Assistant"
      >
        <div className="ask-header">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">
              Assistant
            </span>
            <button
              data-testid="assistant-scope"
              onClick={() =>
                a.setScope(a.scope === "book" ? "library" : "book")
              }
              disabled={!bookId}
              className="press rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground disabled:opacity-40"
            >
              {a.scope === "book" ? "This book" : "All my books"}
            </button>
          </div>
          <button
            data-testid="assistant-close"
            onClick={onClose}
            aria-label="Close"
            className="ask-x"
          >
            ✕
          </button>
        </div>

        {/* The threads: a row of chips, and a new one. */}
        <div
          data-testid="assistant-threads"
          className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2"
        >
          <button
            data-testid="assistant-new-thread"
            onClick={a.newThread}
            className="press shrink-0 rounded-full border border-primary px-3 py-1 text-[12px] font-semibold text-primary"
          >
            + New thread
          </button>
          {a.threads.map((t) => (
            <button
              key={t.id}
              data-testid={`assistant-thread-${t.id}`}
              onClick={() => a.selectThread(t.id)}
              className={`press max-w-[180px] shrink-0 truncate rounded-full border px-3 py-1 text-[12px] ${
                t.id === a.thread?.id
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {threadTitle(t)}
            </button>
          ))}
        </div>

        {!a.hasKey ? (
          <div data-testid="assistant-nokey" className="ask-nokey">
            <p>Ask your own books anything.</p>
            <p className="ask-muted">
              Add your free Gemini key to switch the assistant on.
            </p>
            <button
              data-testid="assistant-to-settings"
              onClick={onOpenSettings}
              className="ask-cta"
            >
              Add key in Settings
            </button>
          </div>
        ) : (
          <>
            <div
              ref={listRef}
              data-testid="assistant-messages"
              className="ask-messages"
            >
              {a.messages.length === 0 && !a.sending && (
                <p className="ask-muted ask-hint">
                  {a.indexed
                    ? "Ask anything about your library — “what is the story so far?”, “why did he leave?” The answer comes from your own books, with the page it is on."
                    : "Your books are not indexed yet — the assistant finds passages in them once they are indexed."}
                </p>
              )}
              {!a.indexed && !a.sending && (
                <button
                  data-testid="assistant-index"
                  onClick={a.indexLibrary}
                  className="press mx-auto mb-2 rounded-full border border-primary px-4 py-2 text-[13px] font-semibold text-primary"
                >
                  {a.indexing ? "Indexing…" : "Index my books"}
                </button>
              )}
              {a.messages.map((m, i) =>
                m.role === "user" ? (
                  <div
                    key={i}
                    data-testid="assistant-question"
                    className="ask-msg user"
                  >
                    {m.text}
                  </div>
                ) : (
                  renderAnswer(m, i)
                ),
              )}
              {a.sending && (
                <div className="ask-msg ai ask-thinking" aria-label="Thinking">
                  …
                </div>
              )}
              {a.error && (
                <div data-testid="assistant-error" className="ask-error">
                  <p>{a.error}</p>
                </div>
              )}
            </div>
            <div className="ask-input-row">
              <input
                data-testid="assistant-input"
                value={a.input}
                onChange={(e) => a.setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void a.send(a.input);
                    a.setInput("");
                  }
                }}
                placeholder="Ask your library…"
                aria-label="Ask a question"
                className="ask-input"
                disabled={a.sending}
              />
              <button
                data-testid="assistant-send"
                onClick={() => {
                  void a.send(a.input);
                  a.setInput("");
                }}
                disabled={a.sending || !a.input.trim()}
                aria-label="Send"
                className="ask-send"
              >
                →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
