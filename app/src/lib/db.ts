// Minimal IndexedDB storage (no dependency): books + reading progress + marks.
import type { BookDoc, Position } from "./types";
import { migrateBook } from "./types";

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

/** Stored books in the old (v1/v2) pages shape migrate transparently. */
export async function getBook(id: string): Promise<BookDoc | undefined> {
  const raw = await tx<unknown>("books", "readonly", (s) => s.get(id));
  if (!raw) return undefined;
  const book = migrateBook(raw);
  // Persist the migrated shape once so this is a one-time cost.
  if (!(raw as Record<string, unknown>).items) {
    tx("books", "readwrite", (s) => s.put(book)).catch(() => {});
  }
  return book;
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
      const books = (req.result as unknown[]).map((raw) => {
        const b = migrateBook(raw);
        return {
          id: b.id,
          title: b.title,
          totalSentences: b.totalSentences,
          createdAt: b.createdAt,
          source: b.source,
        };
      });
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

export interface PartMark {
  /** `${bookId}:${itemIndex}:${partIndex}` */
  id: string;
  bookId: string;
  /** part key, e.g. "12:1" */
  partKey: string;
  highlight: boolean;
  bookmark: boolean;
  /** reader note text, null when none */
  note: string | null;
}

export interface MarkState {
  highlight: boolean;
  bookmark: boolean;
  note: string | null;
}



const markId = (bookId: string, partKey: string) => `${bookId}:${partKey}`;

/** All marks for a book, keyed by part key ("itemIndex:partIndex"). */
export async function getMarks(
  bookId: string,
): Promise<Record<string, MarkState>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("marks", "readonly");
    const req = t.objectStore("marks").getAll();
    req.onsuccess = () => {
      const out: Record<string, MarkState> = {};
      for (const m of req.result as PartMark[]) {
        if (m.bookId === bookId) {
          out[m.partKey] = {
            highlight: !!m.highlight,
            bookmark: !!m.bookmark,
            note: m.note ?? null,
          };
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

function readMark(
  store: IDBObjectStore,
  id: string,
  bookId: string,
  partKey: string,
): Promise<PartMark> {
  return new Promise((resolve, reject) => {
    const get = store.get(id);
    get.onsuccess = () => {
      const cur = (get.result as PartMark | undefined) ?? {
        id,
        bookId,
        partKey,
        highlight: false,
        bookmark: false,
        note: null,
      };
      // Tolerate records written before the note field existed.
      if (cur.note === undefined) cur.note = null;
      resolve(cur);
    };
    get.onerror = () => reject(get.error);
  });
}

function stateOf(m: PartMark): MarkState {
  return { highlight: m.highlight, bookmark: m.bookmark, note: m.note };
}

/** Toggle one kind of mark on a part; returns that part's marks. */
export async function toggleMark(
  bookId: string,
  partKey: string,
  kind: "highlight" | "bookmark",
): Promise<MarkState> {
  const id = markId(bookId, partKey);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("marks", "readwrite");
    const store = t.objectStore("marks");
    readMark(store, id, bookId, partKey).then(
      (cur) => {
        cur[kind] = !cur[kind];
        const put = store.put(cur);
        put.onsuccess = () => {
          resolve(stateOf(cur));
          db.close();
        };
        put.onerror = () => {
          reject(put.error);
          db.close();
        };
      },
      (e) => {
        reject(e);
        db.close();
      },
    );
  });
}

/**
 * Set (or clear, with null/empty) the note on a part.
 * Records whose marks are all empty are deleted to keep the store tidy.
 */
export async function setNote(
  bookId: string,
  partKey: string,
  text: string | null,
): Promise<MarkState> {
  const id = markId(bookId, partKey);
  const note = text && text.trim() ? text.trim() : null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("marks", "readwrite");
    const store = t.objectStore("marks");
    readMark(store, id, bookId, partKey).then(
      (cur) => {
        cur.note = note;
        const done = () => {
          resolve(stateOf(cur));
          db.close();
        };
        if (!cur.highlight && !cur.bookmark && cur.note == null) {
          const del = store.delete(id);
          del.onsuccess = done;
          del.onerror = () => {
            reject(del.error);
            db.close();
          };
        } else {
          const put = store.put(cur);
          put.onsuccess = done;
          put.onerror = () => {
            reject(put.error);
            db.close();
          };
        }
      },
      (e) => {
        reject(e);
        db.close();
      },
    );
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
