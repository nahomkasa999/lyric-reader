// The threads (v4.13) — the conversations of the assistant.
//
// A thread is a short, independent conversation. It lives in IndexedDB
// (lib/assistantStore.ts), so it survives a reload, and the hook keeps
// the list in memory while it is open.
import { useCallback, useEffect, useState } from "react";
import {
  deleteThread as removeThread,
  listThreads,
  makeThread,
  saveThread,
  type Thread,
} from "../../lib/assistantStore";

export interface ThreadsState {
  threads: Thread[];
  thread: Thread | null;
  newThread: () => void;
  selectThread: (id: string) => void;
  deleteThread: (id: string) => void;
  /** write a thread back and show it */
  commit: (thread: Thread) => void;
}

export function useThreads(bookId?: string): ThreadsState {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);

  // The threads of THIS book — a different book has its own.
  useEffect(() => {
    let cancelled = false;
    listThreads(bookId)
      .then((rows) => {
        if (cancelled) return;
        setThreads(rows);
        setThreadId((cur) => rows.some((t) => t.id === cur) ? cur : rows[0]?.id ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const newThread = useCallback(() => {
    const t = makeThread(bookId ? "book" : "library", bookId);
    setThreads((prev) => [t, ...prev]);
    setThreadId(t.id);
    saveThread(t).catch(() => {});
  }, [bookId]);

  const selectThread = useCallback((id: string) => {
    setThreadId(id);
  }, []);

  const deleteThread = useCallback((id: string) => {
    void removeThread(id).catch(() => {});
    setThreads((prev) => {
      const rest = prev.filter((t) => t.id !== id);
      setThreadId((cur) => (cur === id ? rest[0]?.id ?? null : cur));
      return rest;
    });
  }, []);

  const commit = useCallback((thread: Thread) => {
    setThreads((prev) => [thread, ...prev.filter((t) => t.id !== thread.id)]);
    setThreadId(thread.id);
    saveThread(thread).catch(() => {});
  }, []);

  const thread = threads.find((t) => t.id === threadId) ?? null;
  return { threads, thread, newThread, selectThread, deleteThread, commit };
}
