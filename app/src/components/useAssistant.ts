// The assistant (v4.12): state and actions.
//
// The assistant answers from the reader's own library: the question is
// embedded, the knowledge base is searched, and the passages that come
// back are the only thing the model is allowed to use.
//
// A THREAD is a short, independent conversation. "New thread" starts an
// empty one — that is the answer to "the chart is going really really
// large": a question that has nothing to do with the last one gets its
// own thread, and the prompt never grows without bound.
import { useCallback, useEffect, useRef, useState } from "react";
import { aiGenerate, GeminiError } from "../lib/ai";
import { getEffectiveApiKey } from "../lib/apikey";
import { listBooks } from "../lib/db";
import { embedQuery } from "../lib/embeddings";
import {
  buildAssistantPrompt,
  passagesOf,
} from "../lib/assistantContext";
import {
  listThreads,
  makeThread,
  saveThread,
  threadTitle,
  type AssistantMessage,
  type Source,
  type Thread,
} from "../lib/assistantStore";
import { search, searchByWords } from "../lib/vectorIndex";
import { useAssistantLibrary } from "./useAssistantLibrary";

export type AssistantScope = "book" | "library";

export interface AssistantState {
  threads: Thread[];
  thread: Thread | null;
  messages: AssistantMessage[];
  scope: AssistantScope;
  setScope: (s: AssistantScope) => void;
  input: string;
  setInput: (s: string) => void;
  sending: boolean;
  error: string | null;
  /** how many passages the knowledge base holds */
  indexed: number;
  hasKey: boolean;
  newThread: () => void;
  selectThread: (id: string) => void;
  send: (question: string) => Promise<void>;
  /** index every book that is not indexed yet */
  indexLibrary: () => void;
  /** is the library being indexed right now */
  indexing: boolean;
  /** the sources of the last answer */
  sources: Source[];
}

export interface AssistantOptions {
  /** the book that is open right now, if any */
  bookId?: string;
  /** the title of that book */
  bookTitle?: string;
}

export function useAssistant(opts: AssistantOptions = {}): AssistantState {
  const { bookId } = opts;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [scope, setScope] = useState<AssistantScope>(
    bookId ? "book" : "library",
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [hasKey, setHasKey] = useState(() => getEffectiveApiKey().length > 0);
  const threadRef = useRef<Thread | null>(null);
  threadRef.current = threads.find((t) => t.id === threadId) ?? null;
  const library = useAssistantLibrary();

  // The threads and the size of the knowledge base.
  useEffect(() => {
    let cancelled = false;
    listThreads()
      .then((rows) => {
        if (cancelled) return;
        setThreads(rows);
        setThreadId((cur) => cur ?? rows[0]?.id ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const newThread = useCallback(() => {
    const t = makeThread(scope, bookId);
    setThreads((prev) => [t, ...prev]);
    setThreadId(t.id);
    setSources([]);
    setError(null);
    saveThread(t).catch(() => {});
  }, [scope, bookId]);

  const selectThread = useCallback((id: string) => {
    setThreadId(id);
    setSources([]);
    setError(null);
  }, []);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || sending) return;
      const key = getEffectiveApiKey();
      setHasKey(key.length > 0);
      if (!key) {
        setError(
          "Add a Gemini key in Settings to ask your library — the answers come from your own books.",
        );
        return;
      }
      setSending(true);
      setError(null);

      const thread =
        threadRef.current ?? makeThread(scope, bookId);
      const history = thread.messages;
      const withUser: AssistantMessage[] = [
        ...history,
        { role: "user", text: q, at: Date.now() },
      ];
      const scopeBook = scope === "book" ? bookId : undefined;

      try {
        // 1. Find the passages that answer the question.
        let hits = [] as Awaited<ReturnType<typeof search>>;
        try {
          const vector = await embedQuery(q, key);
          hits = vector
            ? await search(vector, q, { bookId: scopeBook })
            : await searchByWords(q, { bookId: scopeBook });
        } catch {
          // The embedding failed (no quota, offline): the words still work.
          hits = await searchByWords(q, { bookId: scopeBook });
        }

        // 2. Give the model only those passages.
        const books = await listBooks().catch(() => []);
        const titles = new Map(books.map((b) => [b.id, b.title]));
        const passages = passagesOf(hits, titles);
        const prompt = buildAssistantPrompt(q, passages, history);

        // 3. Ask.
        const answer = await aiGenerate({
          apiKey: key,
          system: prompt.system,
          messages: prompt.messages,
          maxTokens: 1500,
        });

        const src: Source[] = hits.slice(0, 6).map((h) => ({
          bookId: h.chunk.bookId,
          bookTitle: titles.get(h.chunk.bookId) ?? "Your book",
          heading: h.chunk.heading,
          page: h.chunk.page,
          item: h.chunk.from,
          text: h.chunk.text,
        }));
        setSources(src);

        const next: Thread = {
          ...thread,
          messages: [
            ...withUser,
            { role: "ai", text: answer.trim(), sources: src, at: Date.now() },
          ],
          updatedAt: Date.now(),
        };
        setThreads((prev) => {
          const rest = prev.filter((t) => t.id !== next.id);
          return [next, ...rest];
        });
        setThreadId(next.id);
        saveThread(next).catch(() => {});
      } catch (e) {
        const reason =
          e instanceof GeminiError
            ? e.message
            : "Couldn't reach the AI — check your connection.";
        setError(reason);
      } finally {
        setSending(false);
      }
    },
    [sending, scope, bookId],
  );

  return {
    threads,
    thread: threadRef.current,
    messages: threadRef.current?.messages ?? [],
    scope,
    setScope,
    input,
    setInput,
    sending,
    error,
    indexed: library.indexed,
    hasKey,
    newThread,
    selectThread,
    send,
    indexLibrary: library.indexLibrary,
    indexing: library.indexing,
    sources,
  };
}

/** The name of a thread, for the chip that opens it. */
export { threadTitle };
