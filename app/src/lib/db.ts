// Minimal IndexedDB storage (no dependency): books + reading progress.
import type { BookDoc, Position } from "./types";

const DB_NAME = "lyric-reader";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("books"))
        db.createObjectStore("books", { keyPath: "id" });
      if (!db.objectStoreNames.contains("progress"))
        db.createObjectStore("progress");
      // v2: per-sentence marks (highlights + bookmarks), keyed
      // `${bookId}:${sentenceId}` so marks are easy to clear per book.
      if (!db.objectStoreNames.contains("marks"))
        db.createObjectStore("marks", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => {
      resolve(req.result);
      db.close();
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}

export async function saveBook(book: BookDoc): Promise<void> {
  await tx("books", "readwrite", (s) => s.put(book));
}

export async function getBook(id: string): Promise<BookDoc | undefined> {
  return tx("books", "readonly", (s) => s.get(id));
}

export interface BookMeta {
  id: string;
  title: string;
  totalSentences: number;
  createdAt: number;
  source: BookDoc["source"];
}

export async function listBooks(): Promise<BookMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("books", "readonly");
    const req = t.objectStore("books").getAll();
    req.onsuccess = () => {
      const books = (req.result as BookDoc[]).map((b) => ({
        id: b.id,
        title: b.title,
        totalSentences: b.totalSentences,
        createdAt: b.createdAt,
        source: b.source,
      }));
      books.sort((a, b) => b.createdAt - a.createdAt);
      resolve(books);
      db.close();
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}

export async function deleteBook(id: string): Promise<void> {
  await tx("books", "readwrite", (s) => s.delete(id));
  await tx("progress", "readwrite", (s) => s.delete(id));
  await deleteMarksForBook(id);
}

export interface SentenceMark {
  /** `${bookId}:${sentenceId}` */
  id: string;
  bookId: string;
  sentenceId: string;
  highlight: boolean;
  bookmark: boolean;
}

const markId = (bookId: string, sentenceId: string) =>
  `${bookId}:${sentenceId}`;

/** All marks for a book, keyed by sentence id. */
export async function getMarks(
  bookId: string,
): Promise<Record<string, { highlight: boolean; bookmark: boolean }>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("marks", "readonly");
    const req = t.objectStore("marks").getAll();
    req.onsuccess = () => {
      const out: Record<string, { highlight: boolean; bookmark: boolean }> =
        {};
      for (const m of req.result as SentenceMark[]) {
        if (m.bookId === bookId) {
          out[m.sentenceId] = { highlight: m.highlight, bookmark: m.bookmark };
        }
      }
      resolve(out);
      db.close();
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}

/** Toggle one kind of mark on a sentence; returns the sentence's marks. */
export async function toggleMark(
  bookId: string,
  sentenceId: string,
  kind: "highlight" | "bookmark",
): Promise<{ highlight: boolean; bookmark: boolean }> {
  const id = markId(bookId, sentenceId);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("marks", "readwrite");
    const store = t.objectStore("marks");
    const get = store.get(id);
    get.onsuccess = () => {
      const cur = (get.result as SentenceMark | undefined) ?? {
        id,
        bookId,
        sentenceId,
        highlight: false,
        bookmark: false,
      };
      cur[kind] = !cur[kind];
      const put = store.put(cur);
      put.onsuccess = () => {
        resolve({ highlight: cur.highlight, bookmark: cur.bookmark });
        db.close();
      };
      put.onerror = () => {
        reject(put.error);
        db.close();
      };
    };
    get.onerror = () => {
      reject(get.error);
      db.close();
    };
  });
}

async function deleteMarksForBook(bookId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("marks", "readwrite");
    const store = t.objectStore("marks");
    const req = store.getAllKeys();
    req.onsuccess = () => {
      for (const k of req.result as string[]) {
        if (k.startsWith(`${bookId}:`)) store.delete(k);
      }
      t.oncomplete = () => {
        resolve();
        db.close();
      };
      t.onerror = () => {
        reject(t.error);
        db.close();
      };
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}

export async function saveProgress(
  bookId: string,
  pos: Position,
): Promise<void> {
  await tx("progress", "readwrite", (s) => s.put(pos, bookId));
}

export async function getProgress(
  bookId: string,
): Promise<Position | undefined> {
  return tx("progress", "readonly", (s) => s.get(bookId));
}

const SAMPLE_FLAG = "lyric-reader.sample-seeded-v1";
export function isSampleSeeded(): boolean {
  try {
    return localStorage.getItem(SAMPLE_FLAG) === "1";
  } catch {
    return false;
  }
}
export function markSampleSeeded(): void {
  try {
    localStorage.setItem(SAMPLE_FLAG, "1");
  } catch {
    /* private mode: sample just re-seeds */
  }
}
