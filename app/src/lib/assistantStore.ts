// The assistant's conversations (v4.12).
//
// A thread is a SHORT, independent conversation: it starts empty, it
// belongs to one scope (this book, or the whole library), and it never
// grows without bound — the prompt takes the last few messages plus a
// running digest of the older ones (lib/assistantContext.ts).
//
// This is the answer to "the chart is going really really large": a new
// question that has nothing to do with the last one starts a new thread,
// and the old one is still there, still readable, never in the way.
import { openDb } from "./db";

/** Where an answer came from. */
export interface Source {
  bookId: string;
  bookTitle: string;
  heading: string;
  /** 1-based page */
  page: number;
  /** the item index to jump to */
  item: number;
  /** the passage itself */
  text: string;
}

/** One message in a thread. */
export interface AssistantMessage {
  role: "user" | "ai";
  text: string;
  /** the passages the answer came from */
  sources?: Source[];
  at: number;
}

/** One conversation. */
export interface Thread {
  id: string;
  /** the first question — what the thread is called */
  title: string;
  /** "book" = one book, "library" = everything the reader has */
  scope: "book" | "library";
  /** the book a "book"-scoped thread belongs to */
  bookId?: string;
  messages: AssistantMessage[];
  createdAt: number;
  updatedAt: number;
}

function newId(): string {
  return `th-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** A fresh, empty thread. */
export function makeThread(
  scope: Thread["scope"] = "library",
  bookId?: string,
): Thread {
  const now = Date.now();
  return {
    id: newId(),
    title: "New thread",
    scope,
    bookId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const t = db.transaction(store, "readonly");
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as T[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * The threads of one book — pure, so it can be tested.
 *
 * A conversation belongs to the book it was about. The reader who
 * opens a book sees that book's conversations, and the assistant
 * answers from that book only.
 */
export function threadsOfBook(
  threads: Thread[],
  bookId?: string,
): Thread[] {
  const mine = bookId
    ? threads.filter((t) => t.bookId === bookId)
    : threads;
  return mine.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Every thread, newest first.
 *
 * The conversations belong to a book: a reader who opens a book sees
 * the threads of THAT book. Without a book (the library) every thread
 * is listed.
 */
export async function listThreads(bookId?: string): Promise<Thread[]> {
  const all = await getAll<Thread>("threads").catch(() => []);
  return threadsOfBook(all, bookId);
}

/** One thread by id. */
export async function getThread(id: string): Promise<Thread | undefined> {
  const all = await getAll<Thread>("threads").catch(() => []);
  return all.find((t) => t.id === id);
}

/** Write a thread back. */
export async function saveThread(thread: Thread): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("threads", "readwrite");
    t.objectStore("threads").put(thread);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

/** Forget a thread. */
export async function deleteThread(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const t = db.transaction("threads", "readwrite");
    t.objectStore("threads").delete(id);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => {
      db.close();
      resolve();
    };
  });
}

/** The title of a thread: its first question, or "New thread". */
export function threadTitle(thread: Thread): string {
  const first = thread.messages.find((m) => m.role === "user");
  if (!first) return "New thread";
  const q = first.text.trim().replace(/\s+/g, " ");
  return q.length > 42 ? `${q.slice(0, 42)}…` : q;
}
