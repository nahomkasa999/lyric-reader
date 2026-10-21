// The passages of a book (v4.12).
//
// A chunk is what the assistant retrieves: a passage of a few sentences
// with the heading it sits under, the page it is on, and the item range
// it covers — so an answer can point at the exact place in the book.
//
// Pure and unit-tested: the same book in, the same chunks out. Nothing
// here knows about storage or the AI.
import type { Item } from "./types";

/** How long a passage may get before it is cut. */
export const CHUNK_CHARS = 800;

/** One passage of a book. */
export interface Chunk {
  /** `${bookId}:${n}` */
  id: string;
  bookId: string;
  /** the passage text */
  text: string;
  /** the heading it sits under, e.g. "Chapter 3 › The Crash" */
  heading: string;
  /** 1-based page */
  page: number;
  /** the first item index it covers */
  from: number;
  /** the last item index it covers */
  to: number;
}

/**
 * Cut a book into passages.
 *
 * Rules:
 *  · a heading always opens a passage, and it is that passage's heading;
 *  · a passage grows until it would pass CHUNK_CHARS — never mid-item;
 *  · the last item of a passage is repeated at the start of the next one,
 *    so a fact that straddles the cut is still findable from either side.
 */
export function chunkBook(
  bookId: string,
  items: Item[],
): Chunk[] {
  const out: Chunk[] = [];
  let heading = "";
  let buf: number[] = [];
  let bufChars = 0;

  const flush = () => {
    if (!buf.length) return;
    const text = items
      .slice(buf[0], buf[buf.length - 1] + 1)
      .map((it) => it.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      out.push({
        id: `${bookId}:${out.length}`,
        bookId,
        text,
        heading,
        page: (items[buf[0]]?.page ?? 0) + 1,
        from: buf[0],
        to: buf[buf.length - 1],
      });
    }
    buf = [];
    bufChars = 0;
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it?.text?.trim()) continue;
    if (it.kind === "heading") {
      flush();
      heading = it.text.trim();
      buf = [i];
      bufChars = it.text.length;
      continue;
    }
    if (buf.length && bufChars + it.text.length > CHUNK_CHARS) {
      // Close the passage — but carry its last item over, so the two
      // halves of a sentence that straddles the cut are both searchable.
      const last = buf[buf.length - 1];
      flush();
      buf = [last];
      bufChars = items[last].text.length;
    }
    buf.push(i);
    bufChars += it.text.length;
  }
  flush();
  return out;
}

/** Where a chunk came from, in one line. */
export function chunkSource(
  chunk: Chunk,
  bookTitle: string,
): string {
  const where = chunk.heading
    ? `${bookTitle} · ${chunk.heading} · p.${chunk.page}`
    : `${bookTitle} · p.${chunk.page}`;
  return where;
}
