// Minimal IndexedDB storage (no dependency): books + reading progress + marks.
import type { BookDoc, Position } from "./types";
import { migrateBook, resegmentItems, type StoredBookRow } from "./types";
import { splitSentences } from "./segment";

const DB_NAME = "lyric-reader";
// v4: the knowledge base (chunks + their vectors) and the assistant's
// threads joined the library.
// v5: the indexing queue — one row per book that is waiting to be embedded.
const DB_VERSION = 5;

/**
 * A book as it sits in IndexedDB.
 *
 * The rows are plain objects, so the shape is only known at runtime: an
 * old book has `pages` instead of `items`. A named interface keeps the
 * casts honest (and keeps `unknown` out of this file).
 */
type StoredBook = StoredBookRow;

export function openDb(): Promise<IDBDatabase> {
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
      if (!db.objectStoreNames.contains("vocab"))
        db.createObjectStore("vocab", { keyPath: "id" });
      if (!db.objectStoreNames.contains("ask"))
        db.createObjectStore("ask", { keyPath: "bookId" });
      // The knowledge base: the passages of every book, and their
      // embeddings (lib/vectorIndex.ts).
      if (!db.objectStoreNames.contains("chunks"))
        db.createObjectStore("chunks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("vectors"))
        db.createObjectStore("vectors", { keyPath: "id" });
      // The assistant's conversations (lib/assistantStore.ts).
      if (!db.objectStoreNames.contains("threads"))
        db.createObjectStore("threads", { keyPath: "id" });
      // v5: the indexing queue (lib/indexJobs.ts) — one row per book.
      if (!db.objectStoreNames.contains("indexJobs"))
        db.createObjectStore("indexJobs", { keyPath: "bookId" });
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

/**
 * Stored books in the old (v1/v2) pages shape migrate transparently, and
 * paragraph items are re-segmented with the current sentence splitter —
 * a book imported by an older app can carry merged sentences (e.g. the
 * quote-boundary bug), which we heal on open. Pages are inherited from
 * the source item so reading position and page numbers don't shift.
 */
export async function getBook(id: string): Promise<BookDoc | undefined> {
  const raw = await tx<StoredBook | undefined>("books", "readonly", (s) =>
    s.get(id),
  );
  if (!raw) return undefined;
  let book = migrateBook(raw);
  const { items, changed } = resegmentItems(book.items, splitSentences);
  if (changed) {
    book = { ...book, items, totalSentences: items.length };
  }
  // Persist the migrated shape once so this is a one-time cost.
  if (!raw.items || changed) {
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
      const books = (req.result as StoredBook[]).map((raw) => {
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
  await deleteVocabForBook(id);
  await tx("ask", "readwrite", (s) => s.delete(id)).catch(() => {});
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

// ---------------------------------------------------------------------------
// Vocab: words/phrases the user saved with their meanings — the personal
// knowledge base, browsed on the Words view grouped by day.
// ---------------------------------------------------------------------------

export interface VocabRecord {
  /** `${bookId}:${norm}` */
  id: string;
  bookId: string;
  /** display text as selected */
  text: string;
  /** lowercased trimmed, for dedupe + matching */
  norm: string;
  phonetic?: string;
  /** flattened definitions, e.g. "noun — A portable lamp." */
  defs: string[];
  /** AI line for phrases / in-context meanings */
  contextMeaning?: string;
  bookTitle: string;
  /** 1-based page */
  page: number;
  item: number;
  part: number;
  /** the full sentence the word was found in */
  sentence: string;
  savedAt: number;
  /** local YYYY-MM-DD, for day grouping */
  dayKey: string;
}

/**
 * Upsert by norm: re-saving updates the context fields (page, sentence,
 * definitions) to the latest, but keeps the original savedAt/dayKey —
 * the word's "learned" day is when he first saved it.
 */
export async function saveVocab(
  rec: Omit<VocabRecord, "id" | "savedAt" | "dayKey"> & {
    savedAt?: number;
    dayKey?: string;
  },
): Promise<VocabRecord> {
  const id = `${rec.bookId}:${rec.norm}`;
  const existing = await tx<VocabRecord | undefined>(
    "vocab",
    "readonly",
    (s) => s.get(id),
  ).catch(() => undefined);
  const savedAt = existing?.savedAt ?? rec.savedAt ?? Date.now();
  const dayKey = existing?.dayKey ?? rec.dayKey ?? localDayKey(savedAt);
  const full: VocabRecord = { ...rec, id, savedAt, dayKey };
  await tx("vocab", "readwrite", (s) => s.put(full));
  return full;
}

export function localDayKey(ts: number): string {
  const d = new Date(ts);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export async function listVocab(bookId?: string): Promise<VocabRecord[]> {
  const all = await tx<VocabRecord[]>("vocab", "readonly", (s) =>
    s.getAll(),
  ).catch(() => [] as VocabRecord[]);
  const rows = bookId ? all.filter((r) => r.bookId === bookId) : all;
  rows.sort((a, b) => b.savedAt - a.savedAt);
  return rows;
}

export async function deleteVocab(id: string): Promise<void> {
  await tx("vocab", "readwrite", (s) => s.delete(id)).catch(() => {});
}

async function deleteVocabForBook(bookId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve) => {
    const t = db.transaction("vocab", "readwrite");
    const store = t.objectStore("vocab");
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
        resolve();
        db.close();
      };
    };
    req.onerror = () => {
      resolve();
      db.close();
    };
  });
}

// ---------------------------------------------------------------------------
// Ask threads: per-book chat history with the AI about the passage.
// ---------------------------------------------------------------------------

export interface AskMessage {
  role: "user" | "ai";
  text: string;
}

export async function getAskThread(bookId: string): Promise<AskMessage[]> {
  const row = await tx<{ bookId: string; messages: AskMessage[] } | undefined>(
    "ask",
    "readonly",
    (s) => s.get(bookId),
  ).catch(() => undefined);
  return row?.messages ?? [];
}

export async function saveAskThread(
  bookId: string,
  messages: AskMessage[],
): Promise<void> {
  await tx("ask", "readwrite", (s) =>
    s.put({ bookId, messages: messages.slice(-60) }),
  ).catch(() => {});
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
