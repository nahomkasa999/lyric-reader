// The assistant (v4.13): state and actions.
//
// The assistant answers from the reader's own library: the question is
// embedded, the passages are searched, and the passages that come back
// are the only thing the model is allowed to use.
//
// Two rules shape everything here:
//   · the reader has only read up to the page they are on, so the
//     search stops there too (unless spoilers are allowed);
//   · a question that needs a key but has none must say so, not fail
//     silently — the passages are searchable either way.
//
// A THREAD is a short, independent conversation. "New thread" starts an
// empty one — that is the answer to "the chart is going really large".
import { useCallback, useState } from "react";
import { getEffectiveApiKey } from "../lib/apikey";
import { threadTitle, type Source } from "../lib/assistantStore";
import { useAssistantLibrary } from "./useAssistantLibrary";
import { useAnswers } from "./assistant/useAnswers";
import { useSuggestions } from "./assistant/useSuggestions";
import { useThreads } from "./assistant/useThreads";
import type {
  AssistantOptions,
  AssistantState,
} from "./assistant/useAssistantTypes";

export type { AssistantOptions, AssistantState } from "./assistant/useAssistantTypes";

export function useAssistant(opts: AssistantOptions = {}): AssistantState {
  const { bookId, bookTitle, item } = opts;
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [spoilers, setSpoilers] = useState(false);
  const [hasKey, setHasKey] = useState(() => getEffectiveApiKey().length > 0);
  const threads = useThreads(bookId);
  const library = useAssistantLibrary();
  const suggestions = useSuggestions(bookId);
  const answers = useAnswers({
    bookId,
    bookTitle,
    item,
    spoilers,
    threads,
    setError,
    setSending,
    setStreaming,
    setSources,
    setLive,
  });

  const send = useCallback(
    async (question: string) => {
      if (sending) return;
      setHasKey(getEffectiveApiKey().length > 0);
      await answers.send(question);
    },
    [answers, sending],
  );

  return {
    threads: threads.threads,
    thread: threads.thread,
    messages: threads.thread?.messages ?? [],
    streaming,
    live,
    input,
    setInput,
    sending,
    error,
    retry: answers.retry,
    stop: answers.stop,
    send,
    recap: answers.recap,
    newThread: () => {
      threads.newThread();
      setSources([]);
      setError(null);
    },
    selectThread: (id: string) => {
      threads.selectThread(id);
      setSources([]);
      setError(null);
    },
    deleteThread: threads.deleteThread,
    indexed: library.indexed,
    jobs: library.jobs,
    online: library.online,
    pause: library.pause,
    retryIndex: library.retry,
    hasKey,
    sources,
    spoilers,
    setSpoilers,
    suggestions,
  };
}

/** The name of a thread, for the row that opens it. */
export { threadTitle };
