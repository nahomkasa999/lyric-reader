// Minimal IndexedDB storage (no dependency): books + reading progress.
import type { BookDoc, Position } from "./types";

const DB_NAME = "lyric-reader";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("books"))
        db.createObjectStore("books", { keyPath: "id" });
      if (!db.objectStoreNames.contains("progress"))
        db.createObjectStore("progress");
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
