// Shared document model for Lyric Reader.

export type BlockKind = "heading" | "para" | "bullet";

export interface Block {
  kind: BlockKind;
  /** heading depth (1-6) or bullet nesting level (0-based) */
  level: number;
  text: string;
}

export interface Sentence {
  id: string;
  text: string;
  kind: BlockKind;
  level: number;
}

export interface Page {
  /** stable label for display, e.g. "Page 3" or "Chapter 2 · Page 4" */
  label: string;
  sentences: Sentence[];
}

export interface BookDoc {
  id: string;
  title: string;
  pages: Page[];
  totalSentences: number;
  createdAt: number;
  source: "sample" | "upload" | "paste";
}

export interface Position {
  page: number;
  sent: number;
}

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/** Flatten blocks into sentences and chunk them into pages. */
export function paginate(
  blocks: Block[],
  sentencesPerPage: number,
  splitIntoSentences: (text: string) => string[],
  labelFor: (pageIndex: number) => string = (i) => `Page ${i + 1}`,
): Page[] {
  const sentences: Sentence[] = [];
  for (const b of blocks) {
    const parts =
      b.kind === "heading" ? [b.text] : splitIntoSentences(b.text);
    for (const t of parts) {
      const text = t.trim();
      if (!text) continue;
      sentences.push({
        id: nextId("s"),
        text,
        kind: b.kind,
        level: b.level,
      });
    }
  }
  const pages: Page[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerPage) {
    pages.push({
      label: labelFor(i / sentencesPerPage),
      sentences: sentences.slice(i, i + sentencesPerPage),
    });
  }
  if (pages.length === 0) {
    pages.push({ label: labelFor(0), sentences: [] });
  }
  return pages;
}

/** Move one step. Returns the new position (clamped at book ends). */
export function step(
  pages: Page[],
  pos: Position,
  dir: 1 | -1,
): Position {
  const page = pages[pos.page];
  if (!page) return { page: 0, sent: 0 };
  if (dir === 1) {
    if (pos.sent < page.sentences.length - 1)
      return { page: pos.page, sent: pos.sent + 1 };
    if (pos.page < pages.length - 1) return { page: pos.page + 1, sent: 0 };
    return pos; // end of book
  }
  if (pos.sent > 0) return { page: pos.page, sent: pos.sent - 1 };
  if (pos.page > 0) {
    const prev = pages[pos.page - 1].sentences.length;
    return { page: pos.page - 1, sent: Math.max(0, prev - 1) };
  }
  return pos; // start of book
}

/** Sentences already read on the current page (the muted top block). */
export function trailSentences(pages: Page[], pos: Position): Sentence[] {
  return pages[pos.page]?.sentences.slice(0, pos.sent) ?? [];
}

/** Sentences still to come on the current page (the muted bottom block). */
export function upcomingSentences(
  pages: Page[],
  pos: Position,
): Sentence[] {
  return pages[pos.page]?.sentences.slice(pos.sent + 1) ?? [];
}

/** Overall progress as a fraction 0..1. */
export function progressOf(book: BookDoc, pos: Position): number {
  if (book.totalSentences === 0) return 0;
  let done = 0;
  for (let p = 0; p < pos.page && p < book.pages.length; p++) {
    done += book.pages[p].sentences.length;
  }
  done += Math.min(
    pos.sent,
    (book.pages[pos.page]?.sentences.length ?? 1) - 1,
  );
  return Math.min(1, done / book.totalSentences);
}
