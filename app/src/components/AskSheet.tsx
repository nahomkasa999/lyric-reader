// Ask sheet: "?" about the passage. A bottom sheet over the fx-blurred
// stage, with a context chip showing what's being sent. The AI gets the
// previous + current + next page with the current sentence marked
// (lib/askContext). «quoted» sentences in answers become tappable jumps.
import { useEffect, useMemo, useRef, useState } from "react";
import type { BookDoc } from "../lib/types";
import { splitS } from "../lib/parts";
import { buildAskContext, findQuote, splitQuotes } from "../lib/askContext";
import { aiGenerate, GeminiError } from "../lib/ai";
import { getEffectiveApiKey } from "../lib/apikey";
import { getAskThread, saveAskThread, type AskMessage } from "../lib/db";

interface Props {
  bookId: string;
  book: BookDoc;
  itemIndex: number;
  onClose: () => void;
  onJump: (item: number, part: number) => void;
  onOpenSettings: () => void;
}

function partsOf(items: BookDoc["items"]) {
  const cache = new Map<number, string[]>();
  return (i: number) => {
    let p = cache.get(i);
    if (!p) {
      p = splitS(items[i]?.text ?? "");
      cache.set(i, p);
    }
    return p;
  };
}

export default function AskSheet({
  bookId,
  book,
  itemIndex,
  onClose,
  onJump,
  onOpenSettings,
}: Props) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(() => getEffectiveApiKey().length > 0);
  const keyAtSend = useRef<string>("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const touchY = useRef<number | null>(null);

  const ctx = useMemo(
    () => buildAskContext(book.title, book.items, itemIndex),
    [book, itemIndex],
  );
  const partsOfMemo = useMemo(() => partsOf(book.items), [book]);

  // Restore the thread for this book.
  useEffect(() => {
    let cancelled = false;
    getAskThread(bookId)
      .then((m) => {
        if (!cancelled) setMessages(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Keep the latest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const persist = (msgs: AskMessage[]) => {
    setMessages(msgs);
    saveAskThread(bookId, msgs).catch(() => {});
  };

  const send = async (query: string, thread: AskMessage[], key: string) => {
    const q = query.trim();
    if (!q || sending) return;
    setSending(true);
    setError(null);
    setFailedQuery(null);
    const withUser: AskMessage[] = [...thread, { role: "user", text: q }];
    persist(withUser);
    setInput("");
    try {
      const history = withUser.slice(0, -1).map((m) => ({
        role: (m.role === "ai" ? "model" : "user") as "user" | "model",
        text: m.text,
      }));
      const text = await aiGenerate({
        apiKey: key,
        system: ctx.systemInstruction,
        messages: [
          ...history,
          {
            role: "user",
            text: `PASSAGE:\n${ctx.contextText}\n\nMY QUESTION: ${q}`,
          },
        ],
        maxTokens: 1500,
      });
      persist([...withUser, { role: "ai", text: text.trim() }]);
    } catch (e) {
      const reason =
        e instanceof GeminiError
          ? e.message
          : "Couldn't reach the AI — check your connection.";
      setError(reason);
      setFailedQuery(q);
    } finally {
      setSending(false);
    }
  };

  const onSubmit = () => {
    const key = getEffectiveApiKey();
    setHasKey(key.length > 0);
    if (!key) return;
    keyAtSend.current = key;
    void send(input, messages, key);
  };

  const retry = () => {
    if (!failedQuery) return;
    const key = getEffectiveApiKey();
    if (!key) return;
    void send(failedQuery, messages, key);
  };

  const renderAnswer = (text: string, idx: number) => {
    const segs = splitQuotes(text);
    return (
      <div key={idx} data-testid="ask-answer" className="ask-msg ai">
        {segs.map((s, i) =>
          s.kind === "text" ? (
            <span key={i}>{s.text}</span>
          ) : (
            (() => {
              const hit = findQuote(s.text, book.items, partsOfMemo);
              return hit ? (
                <button
                  key={i}
                  data-testid={`ask-quote-${idx}-${i}`}
                  className="ask-quote"
                  onClick={() => {
                    onJump(hit.item, hit.part);
                    onClose();
                  }}
                >
                  «{s.text}»
                </button>
              ) : (
                <span key={i}>«{s.text}»</span>
              );
            })()
          ),
        )}
      </div>
    );
  };

  return (
    <div
      data-testid="ask-layer"
      className="ask-layer"
      onClick={(e) => {
        // Backdrop tap closes (taps on the sheet itself pass through).
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        // Only a swipe that STARTS on the sheet's header zone can dismiss —
        // a fling inside the message list must just scroll.
        const sheet = (e.currentTarget as HTMLElement).querySelector(
          ".ask-sheet",
        );
        const r = sheet?.getBoundingClientRect();
        const y = e.touches[0].clientY;
        touchY.current =
          r && y - r.top < 130 ? y : null;
      }}
      onTouchEnd={(e) => {
        if (touchY.current == null) return;
        const dy = e.changedTouches[0].clientY - touchY.current;
        touchY.current = null;
        if (dy > 90) onClose();
      }}
    >
      <div
        data-testid="ask-sheet"
        className="ask-sheet"
        role="dialog"
        aria-label="Ask about this passage"
      >
        <div className="ask-header">
          <div className="ask-context-chip" data-testid="ask-context-chip">
            Page {ctx.page} · {book.title}
            {ctx.heading ? ` — ${ctx.heading.slice(0, 42)}` : ""}
          </div>
          <button
            data-testid="ask-close"
            onClick={onClose}
            aria-label="Close"
            className="ask-x"
          >
            ✕
          </button>
        </div>

        {!hasKey ? (
          <div data-testid="ask-nokey" className="ask-nokey">
            <p>Ask questions about what you're reading.</p>
            <p className="ask-muted">
              Add your free Gemini key to switch the AI on.
            </p>
            <button
              data-testid="ask-to-settings"
              onClick={onOpenSettings}
              className="ask-cta"
            >
              Add key in Settings
            </button>
          </div>
        ) : (
          <>
            <div ref={listRef} data-testid="ask-messages" className="ask-messages">
              {messages.length === 0 && !sending && (
                <p className="ask-muted ask-hint">
                  Ask anything about this page — e.g. "why did he take the
                  poker?" The AI only answers from your book.
                </p>
              )}
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} data-testid="ask-question" className="ask-msg user">
                    {m.text}
                  </div>
                ) : (
                  renderAnswer(m.text, i)
                ),
              )}
              {sending && (
                <div className="ask-msg ai ask-thinking" aria-label="Thinking">
                  …
                </div>
              )}
              {error && (
                <div data-testid="ask-error" className="ask-error">
                  <p>{error}</p>
                  {failedQuery && (
                    <button
                      data-testid="ask-retry"
                      onClick={retry}
                      className="ask-cta"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="ask-input-row">
              <input
                data-testid="ask-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder="Ask about this passage…"
                aria-label="Ask a question"
                className="ask-input"
                disabled={sending}
              />
              <button
                data-testid="ask-send"
                onClick={onSubmit}
                disabled={sending || !input.trim()}
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
