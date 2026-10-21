// The outline of a book: its chapters, in reading order.
//
// The item stream already knows the headings (kind === "heading"), so the
// outline is mostly a matter of collecting them and keeping their level.
// A book with no headings at all (a PDF whose text carries no structure)
// still gets one: the outline falls back to the pages, so the sheet is
// never empty and the reader can always jump somewhere useful.
//
// Pure and unit-tested: the same book in, the same outline out.

import type { Item } from "./types";

export type OutlineKind = "heading" | "page";

export interface OutlineEntry {
  /** the item index the entry jumps to */
  item: number;
  /** 1-based reader page */
  page: number;
  /** the title */
  text: string;
  /** 1 = a chapter, 2 = a section inside it, 3 = deeper still */
  level: number;
  /** "heading" for a real heading, "page" for the fallback */
  kind: OutlineKind;
  /** the first line of the section, shown under the title */
  hint?: string;
}

/** The deepest level the outline indents to. */
export const MAX_LEVEL = 3;

/** A hint must fit on one line of the sheet. */
const HINT_CHARS = 88;

function hint(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > HINT_CHARS ? t.slice(0, HINT_CHARS) + "…" : t;
}

/**
 * The outline of a book.
 *
 * Headings win when the book has them — they are what the reader means by
 * "chapter". Otherwise the pages stand in for them, so the sheet still
 * works on a PDF that carries no structure.
 */
export function buildOutline(items: Item[]): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind !== "heading") continue;
    const text = it.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({
      item: i,
      page: it.page + 1,
      text,
      level: Math.min(MAX_LEVEL, Math.max(1, it.depth || 1)),
      kind: "heading",
      hint: firstLineAfter(items, i),
    });
  }
  if (out.length) return out;
  return pageOutline(items);
}

/** The first sentence after a heading — the line that opens the chapter. */
function firstLineAfter(items: Item[], i: number): string | undefined {
  for (let j = i + 1; j < items.length; j++) {
    const it = items[j];
    if (it.kind === "heading") return undefined;
    const t = it.text.trim();
    if (t) return hint(t);
  }
  return undefined;
}

/** The fallback: one entry per page, titled with the page number. */
function pageOutline(items: Item[]): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  let seen = -1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.page === seen) continue;
    seen = it.page;
    out.push({
      item: i,
      page: it.page + 1,
      text: `Page ${it.page + 1}`,
      level: 1,
      kind: "page",
      hint: hint(it.text),
    });
  }
  return out;
}

/**
 * Which entry a position sits in — the last entry at or before it.
 * -1 when the outline is empty.
 */
export function outlineIndexAt(
  outline: OutlineEntry[],
  item: number,
): number {
  if (!outline.length) return -1;
  let idx = -1;
  for (let i = 0; i < outline.length; i++) {
    if (outline[i].item <= item) idx = i;
    else break;
  }
  return idx;
}

/** The entries that match a filter (case-insensitive, over title + hint). */
export function filterOutline(
  outline: OutlineEntry[],
  query: string,
): OutlineEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return outline;
  return outline.filter(
    (e) =>
      e.text.toLowerCase().includes(q) ||
      (e.hint ?? "").toLowerCase().includes(q),
  );
}
