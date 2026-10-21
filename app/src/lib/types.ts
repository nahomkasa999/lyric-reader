// Document model for Lyric Reader (v3).
//
// The reader works on a flat ITEM stream (the user's reference mechanics):
// every sentence is an item {kind, depth, text, page, paraStart}. Stepping
// is per part (see lib/parts.ts splitS): position = (item, part) and moves
// part-first, then item (back lands on the previous item's last part).

export type BlockKind = "heading" | "para" | "bullet";

export interface Block {
  kind: BlockKind;
  /** heading depth (1-6) or bullet nesting level (0-based) */
  level: number;
  text: string;
  /**
   * The font size this block was set in (PDFs only) — the outline uses it
   * to rank headings: the biggest type in the book is level 1, the next
   * one down level 2, and so on.
   */
  size?: number;
}

export interface Item {
  kind: BlockKind;
  /** heading depth (1-6) or bullet nesting level (0-based) */
  depth: number;
  text: string;
  /** reader page index (0-based) */
  page: number;
  /** first sentence of a paragraph block (paragraph-start styling) */
  paraStart: boolean;
}

export interface BookDoc {
  id: string;
  title: string;
  items: Item[];
  /** total items (kept name for DB/library compatibility) */
  totalSentences: number;
  createdAt: number;
  source: "sample" | "upload" | "paste" | "media";
}

export interface Position {
  /** global item index */
  item: number;
  /** part index inside the item (lib/parts.ts) */
  part: number;
}

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export interface ItemDraft {
  kind: BlockKind;
  depth: number;
  text: string;
  paraStart: boolean;
}

/** Flatten blocks into items (headings stay whole; others are sentence-split). */
export function flattenBlocks(
  blocks: Block[],
  splitIntoSentences: (text: string) => string[],
): ItemDraft[] {
  const drafts: ItemDraft[] = [];
  for (const b of blocks) {
    if (b.kind === "heading") {
      const t = b.text.trim();
      if (t) drafts.push({ kind: "heading", depth: b.level, text: t, paraStart: false });
      continue;
    }
    const ss = splitIntoSentences(b.text);
    ss.forEach((raw, i) => {
      const t = raw.trim();
      if (!t) return;
      drafts.push({
        kind: b.kind,
        depth: b.level,
        text: t,
        paraStart: b.kind === "para" && i === 0,
      });
    });
  }
  return drafts;
}

/**
 * Assign reader pages — the user's rule: a new page starts at a heading
 * or after 7 items. (PDFs keep their real extracted pages instead.)
 */
export function assignPages(drafts: ItemDraft[]): Item[] {
  let page = 0;
  let n = 0;
  return drafts.map((d, i) => {
    if (i > 0 && (d.kind === "heading" || n >= 7)) {
      page++;
      n = 0;
    }
    const it: Item = { ...d, page };
    n++;
    return it;
  });
}

/** Blocks -> paged items (EPUB / TXT / paste). */
export function paginateBlocks(
  blocks: Block[],
  splitIntoSentences: (text: string) => string[],
): Item[] {
  return assignPages(flattenBlocks(blocks, splitIntoSentences));
}

/**
 * Move one step (part-first, then item) — the user's go(n) exactly:
 * forward: next part if any, else next item at part 0;
 * back: previous part if any, else previous item at its LAST part.
 * Clamps at both book ends.
 */
export function stepParts(
  parts: string[][],
  pos: Position,
  dir: 1 | -1,
): Position {
  if (dir > 0) {
    if (pos.part < parts[pos.item].length - 1)
      return { item: pos.item, part: pos.part + 1 };
    if (pos.item < parts.length - 1) return { item: pos.item + 1, part: 0 };
    return pos; // end of book
  }
  if (pos.part > 0) return { item: pos.item, part: pos.part - 1 };
  if (pos.item > 0)
    return { item: pos.item - 1, part: parts[pos.item - 1].length - 1 };
  return pos; // start of book
}

/** Overall progress as a fraction 0..1 — item-based like the reference. */
export function progressOf(book: BookDoc, pos: Position): number {
  if (book.totalSentences <= 1) return 0;
  return Math.min(
    1,
    Math.max(0, pos.item) / Math.max(1, book.totalSentences - 1),
  );
}

/** A book as it sits in IndexedDB — old shape or new. */
export interface StoredBookRow {
  id?: string;
  title?: string;
  items?: Item[];
  pages?: Array<{
    sentences?: Array<{ text?: string; kind?: BlockKind; level?: number }>;
  }>;
  totalSentences?: number;
  createdAt?: number;
  source?: string;
}

/**
 * Migrate a stored book from the old shape (pages of sentences, v1/v2)
 * to the item stream. Lossless for the text; v2's sentence-id marks
 * simply won't match the new part keys (noted in DECISIONS.md).
 */
export function migrateBook(stored: StoredBookRow): BookDoc {
  const b = stored;
  if (Array.isArray(b.items)) return b as BookDoc;
  const pages = b.pages ?? [];
  const items: Item[] = [];
  pages.forEach((p, pi) => {
    for (const s of p.sentences ?? []) {
      items.push({
        kind: (s.kind ?? "para") as BlockKind,
        depth: s.level ?? 0,
        text: s.text ?? "",
        page: pi,
        paraStart: false,
      });
    }
  });
  return {
    id: String(b.id ?? ""),
    title: String(b.title ?? "Untitled"),
    items,
    totalSentences: items.length,
    createdAt: Number(b.createdAt ?? 0),
    source: (b.source ?? "upload") as BookDoc["source"],
  };
}

/**
 * Re-segment stored paragraph items with the CURRENT sentence splitter.
 * Sentence segmentation runs at import time, so a book imported by an
 * older app keeps whatever (possibly buggy) splits it had — e.g. the
 * quote-boundary bug that merged `…"dream client.” A dream client…`
 * into one 289-char item. On open, any "para" item that the current
 * splitter breaks into 2+ sentences is replaced by its sentences,
 * inheriting page/depth; headings and bullets stay whole. Idempotent:
 * already-split items pass through untouched.
 *
 * Marks are keyed `item:part` in a separate store and are NOT remapped —
 * after a split, a mark may point at the first derived sentence instead
 * of the one it was saved on. Reader position is clamped on load.
 */
export function resegmentItems(
  items: Item[],
  split: (text: string) => string[],
): { items: Item[]; changed: boolean } {
  let changed = false;
  const out: Item[] = [];
  for (const it of items) {
    if (it.kind !== "para") {
      out.push(it);
      continue;
    }
    const ss = split(it.text).map((s) => s.trim()).filter(Boolean);
    if (ss.length <= 1) {
      out.push(it);
      continue;
    }
    changed = true;
    ss.forEach((s, i) => {
      out.push({
        kind: "para",
        depth: it.depth,
        text: s,
        page: it.page,
        paraStart: i === 0 ? it.paraStart : false,
      });
    });
  }
  return { items: out, changed };
}

/** Convert an old {page, sent} progress record to {item, part}. */
export function migratePosition(
  items: Item[],
  saved: { page?: number; sent?: number; item?: number; part?: number },
): Position {
  if (typeof saved.item === "number") {
    const item = Math.min(Math.max(0, saved.item), items.length - 1);
    return { item: Math.max(0, item), part: Math.max(0, saved.part ?? 0) };
  }
  const page = Math.max(0, Math.min(saved.page ?? 0, items[items.length - 1]?.page ?? 0));
  const idx = items.findIndex((it) => it.page === page);
  return { item: idx >= 0 ? idx : 0, part: 0 };
}
