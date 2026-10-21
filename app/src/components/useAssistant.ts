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
import { useCallback, useEffect, useRef, useState } from "react";
import { aiGenerate, GeminiError } from "../lib/ai";
import { getEffectiveApiKey } from "../lib/apikey";
import { listBooks } from "../lib/db";
import { embedQuery } from "../lib/embeddings";
import {
  buildAssistantPrompt,
  passagesOf,
  type ReaderContext,
} from "../lib/assistantContext";
import {
  listThreads,
  makeThread,
  saveThread,
  threadTitle,
  deleteThread as removeThread,
  type AssistantMessage,
  type Source,
  type Thread,
} from "../lib/assistantStore";
import { retrieve } from "../lib/retrieval";
import { recapReadSoFar } from "../lib/recap";
import type { IndexProgress } from "../lib/indexJobs";
import { useAssistantLibrary } from "./useAssistantLibrary";

export interface AssistantState {
  threads: Thread[];
  thread: Thread | null;
  messages: AssistantMessage[];
  /** the answer is coming in */
  streaming: boolean;
  input: string;
  setInput: (s: string) => void;
  sending: boolean;
  error: string | null;
  /** ask the last question again */
  retry: () => void;
  /** stop the answer that is coming in */
  stop: () => void;
  send: (question: string) => Promise<void>;
  /** "what has happened so far?" */
  recap: () => Promise<void>;
  newThread: () => void;
  selectThread: (id: string) => void;
  deleteThread: (id: string) => void;
  /** how many passages the knowledge base holds */
  indexed: number;
  /** the indexing queue */
  jobs: IndexProgress[];
  hasKey: boolean;
  /** the sources of the last answer */
  sources: Source[];
  /** may the answer mention what happens later? */
  spoilers: boolean;
  setSpoilers: (v: boolean) => void;
}

export interface AssistantOptions {
  /** the book that is open right now, if any */
  bookId?: string;
  /** the title of that book */
  bookTitle?: string;
  /** the item the reader is on — the boundary of the answer */
  item?: number;
}

export function useAssistant(opts: AssistantOptions = {}): AssistantState {
  const { bookId, bookTitle, item } = opts;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [spoilers, setSpoilers] = useState(false);
  const [hasKey, setHasKey] = useState(() => getEffectiveApiKey().length > 0);
  const threadRef = useRef<Thread | null>(null);
  threadRef.current = threads.find((t) => t.id === threadId) ?? null;
  const library = useAssistantLibrary();
  const itemRef = useRef(item);
  itemRef.current = item;
  const spoilersRef = useRef(spoilers);
  spoilersRef.current = spoilers;

  // The threads.
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
    const t = makeThread(bookId ? "book" : "library", bookId);
    setThreads((prev) => [t, ...prev]);
    setThreadId(t.id);
    setSources([]);
    setError(null);
    saveThread(t).catch(() => {});
  }, [bookId]);

  const selectThread = useCallback((id: string) => {
    setThreadId(id);
    setSources([]);
    setError(null);
  }, []);

  const deleteThread = useCallback((id: string) => {
    void removeThread(id).catch(() => {});
    setThreads((prev) => {
      const rest = prev.filter((t) => t.id !== id);
      setThreadId((cur) => (cur === id ? rest[0]?.id ?? null : cur));
      return rest;
    });
  }, []);

  /** Write a thread back and show it. */
  const commit = useCallback((thread: Thread) => {
    setThreads((prev) => [thread, ...prev.filter((t) => t.id !== thread.id)]);
    setThreadId(thread.id);
    saveThread(thread).catch(() => {});
  }, []);

  /** The thread a question belongs to — the open one, or a new one. */
  const target = useCallback((): Thread => {
    return threadRef.current ?? makeThread(bookId ? "book" : "library", bookId);
  }, [bookId]);

  const answer = useCallback(
    async (question: string, history: AssistantMessage[]) => {
      const key = getEffectiveApiKey();
      setHasKey(key.length > 0);
      if (!key) {
        setError(
          "Add a Gemini key in Settings to ask your library — the answers come from your own books.",
        );
        return;
      }
      const thread = target();
      const withUser: AssistantMessage[] = [
        ...history,
        { role: "user", text: question, at: Date.now() },
      ];
      // The question is saved BEFORE the request: a failed answer must
      // not lose what the reader asked.
      const started: Thread = { ...thread, messages: withUser };
      commit(started);

      try {
        // 1. Find the passages that answer the question.
        let vector: Float32Array | null = null;
        try {
          vector = await embedQuery(question, key);
        } catch {
          // No embedding (offline, no quota): the words still work.
          vector = null;
        }
        const maxItem = spoilersRef.current ? undefined : itemRef.current;
        const hits = await retrieve(question, vector, {
          bookId,
          maxItem,
        });

        // 2. Give the model only those passages.
        const books = await listBooks().catch(() => []);
        const titles = new Map(books.map((b) => [b.id, b.title]));
        const passages = passagesOf(hits, titles);
        const ctx: ReaderContext = {
          bookTitle,
          readUpToItem: itemRef.current,
        };
        const prompt = buildAssistantPrompt(question, passages, history, ctx);

        // 3. Ask.
        setStreaming(true);
        const reply = await aiGenerate({
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
        commit({
          ...thread,
          messages: [
            ...withUser,
            { role: "ai", text: reply.trim(), sources: src, at: Date.now() },
          ],
          updatedAt: Date.now(),
        });
      } catch (e) {
        const reason =
          e instanceof GeminiError
            ? e.message
            : "Couldn't reach the AI — check your connection.";
        setError(reason);
      } finally {
        setStreaming(false);
        setSending(false);
      }
    },
    [bookId, bookTitle, commit, target],
  );

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || sending) return;
      setSending(true);
      setError(null);
      await answer(q, target().messages);
    },
    [answer, sending, target],
  );

  /** Ask the last question again — the user bubble is not duplicated. */
  const retry = useCallback(() => {
    const messages = target().messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "user") continue;
      const rest = messages.slice(0, i);
      setSending(true);
      setError(null);
      void answer(m.text, rest);
      return;
    }
  }, [answer, target]);

  /** The recap of what the reader has read so far. */
  const recap = useCallback(async () => {
    if (!bookId) return;
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
    const thread = target();
    const at = itemRef.current ?? 0;
    try {
      const result = await recapReadSoFar({
        bookId,
        maxItem: at,
        key,
        title: bookTitle,
      });
      const src: Source[] = result.passages.map((p) => ({
        bookId,
        bookTitle: p.bookTitle,
        heading: p.heading,
        page: p.page,
        item: 0,
        text: p.text,
      }));
      setSources(src);
      commit({
        ...thread,
        messages: [
          ...thread.messages,
          {
            role: "ai",
            text: result.text,
            sources: src,
            at: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      });
    } catch (e) {
      const reason =
        e instanceof GeminiError
          ? e.message
          : "Couldn't reach the AI — check your connection.";
      setError(reason);
    } finally {
      setSending(false);
    }
  }, [bookId, bookTitle, commit, target]);

  /** Stop the answer that is coming in. */
  const stop = useCallback(() => {
    setStreaming(false);
    setSending(false);
  }, []);

  return {
    threads,
    thread: threadRef.current,
    messages: threadRef.current?.messages ?? [],
    streaming,
    input,
    setInput,
    sending,
    error,
    retry,
    stop,
    send,
    recap,
    newThread,
    selectThread,
    deleteThread,
    indexed: library.indexed,
    jobs: library.jobs,
    hasKey,
    sources,
    spoilers,
    setSpoilers,
  };
}

/** The name of a thread, for the row that opens it. */
export { threadTitle };
