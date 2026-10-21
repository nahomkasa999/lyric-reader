// The assistant sheet (v4.13) — the orchestrator.
//
// A conversation with the reader's own library. The question is matched
// against the passages, the model answers only from the passages that
// were found, and every answer carries its sources — tap one and the
// reader opens at that exact page.
//
// The sheet itself is the shell (components/assistant/ChatSheet.tsx);
// this file is the conversation: the messages, the composer, the
// states, and the threads.
import { useEffect, useRef, useState } from "react";
import ChatSheet from "./assistant/ChatSheet";
import Composer from "./assistant/Composer";
import IndexStrip from "./assistant/IndexStrip";
import Message from "./assistant/Message";
import { NewThreadButton, ThreadsButton } from "./assistant/SheetHeader";
import ThreadDrawer from "./assistant/ThreadDrawer";
import { useSheetDrag } from "./assistant/useSheetDrag";
import { useAssistant, type AssistantOptions } from "./useAssistant";

interface Props extends AssistantOptions {
  onClose: () => void;
  onJump: (bookId: string, item: number) => void;
  onOpenSettings: () => void;
}

export default function AssistantSheet({
  bookId,
  bookTitle,
  item,
  onClose,
  onJump,
  onOpenSettings,
}: Props) {
  const a = useAssistant({ bookId, bookTitle, item });
  const drag = useSheetDrag(onClose);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Keep the latest message in view — unless the reader scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [a.messages, a.sending, a.streaming, atBottom]);

  const send = (question: string) => {
    const q = question.trim();
    if (!q) return;
    a.setInput("");
    void a.send(q);
  };

  const header = (
    <>
      <ThreadsButton onOpenThreads={() => setDrawerOpen(true)} />
    </>
  );
  const headerRight = (
    <NewThreadButton
      onNewThread={() => {
        a.newThread();
        setDrawerOpen(false);
      }}
    />
  );

  return (
    <ChatSheet
      drag={drag}
      onClose={onClose}
      left={header}
      right={headerRight}
      drawer={
        drawerOpen ? (
          <ThreadDrawer
            threads={a.threads}
            currentId={a.thread?.id ?? null}
            onSelect={a.selectThread}
            onDelete={a.deleteThread}
            onClose={() => setDrawerOpen(false)}
          />
        ) : null
      }
    >
      {!a.hasKey ? (
        <div data-testid="assistant-nokey" className="chat-nokey">
          <p>Ask your own books anything.</p>
          <p className="chat-muted">
            Add your free Gemini key to switch the assistant on.
          </p>
          <button
            data-testid="assistant-to-settings"
            className="chat-cta"
            onClick={onOpenSettings}
          >
            Add key in Settings
          </button>
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            data-testid="assistant-messages"
            className="chat-messages"
            onScroll={(e) => {
              const el = e.currentTarget;
              setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
            }}
          >
            <label className="chat-spoilers">
              <input
                type="checkbox"
                data-testid="assistant-spoilers"
                checked={a.spoilers}
                onChange={(e) => a.setSpoilers(e.target.checked)}
              />
              <span>Allow spoilers</span>
            </label>
            {a.messages.length === 0 && (
              <div className="chat-empty">
                <p>Ask your library</p>
                <div className="chat-suggest">
                  {a.suggestions.map((s, i) => (
                    <button
                      key={s}
                      data-testid={`assistant-suggest-${i}`}
                      onClick={() => send(`Tell me about “${s}”.`)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {a.messages.map((m, i) => (
              <Message key={i} message={m} onJump={onJump} />
            ))}
            {a.sending && !a.streaming && (
              <div
                data-testid="assistant-thinking"
                className="chat-thinking"
                aria-label="Thinking"
              >
                <i />
                <i />
                <i />
              </div>
            )}
            {a.error && (
              <div data-testid="assistant-error" className="chat-error">
                <span>{a.error}</span>
                <button data-testid="assistant-retry" onClick={a.retry}>
                  Retry
                </button>
              </div>
            )}
          </div>
          {!atBottom && (
            <button
              className="chat-latest"
              onClick={() => {
                const el = listRef.current;
                if (el) el.scrollTop = el.scrollHeight;
                setAtBottom(true);
              }}
            >
              Jump to latest ↓
            </button>
          )}
          <Composer
            value={a.input}
            onChange={a.setInput}
            onSend={() => send(a.input)}
            onStop={a.stop}
            streaming={a.streaming}
            onFocus={() => drag.snapTo("full")}
            strip={
              <IndexStrip
                jobs={a.jobs}
                online={a.online}
                onPause={a.pause}
                onRetry={a.retryIndex}
              />
            }
          />
        </>
      )}
    </ChatSheet>
  );
}
