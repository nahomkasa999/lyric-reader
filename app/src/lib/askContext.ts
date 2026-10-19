// Ask-context packing (pure, unit-tested): what the AI sees when Nahom
// asks "why did X do Z" about his reading. Prev + current + next page of
// full text, the current sentence marked, the current section heading, and
// an instruction to answer only from the passage and cite sentences.
import type { Item } from "./types";

export interface AskContext {
  title: string;
  heading: string | null;
  page: number;
  pages: number;
  prevPageText: string;
  currentPageText: string;
  nextPageText: string;
  /** the current page's text with the current sentence wrapped in >>> <<< */
  markedPageText: string;
  /** the assembled passage actually sent */
  contextText: string;
  systemInstruction: string;
}

export const ASK_SYSTEM =
  "You are helping a reader understand the book passage below. " +
  "Answer ONLY using the passage. If the passage doesn't contain the answer, " +
  "say so plainly instead of guessing. " +
  "When you rely on a specific sentence, quote it exactly in « » so the reader can find it.";

export function buildAskContext(
  title: string,
  items: Item[],
  itemIndex: number,
): AskContext {
  const pages = items.length ? items[items.length - 1].page + 1 : 0;
  const cur = items[itemIndex];
  const page = cur?.page ?? 0;
  const ofPage = (p: number) =>
    items.filter((it) => it.page === p).map((it) => it.text);

  const prevPageText = ofPage(page - 1).join(" ");
  const nextPageText = ofPage(page + 1).join(" ");
  const currentTexts = ofPage(page);
  const curIdx = items.findIndex((it) => it.page === page);
  const curLocal = curIdx >= 0 ? itemIndex - curIdx : -1;
  const marked = currentTexts
    .map((t, i) => (i === curLocal ? `>>> ${t} <<<` : t))
    .join(" ");
  const currentPageText = currentTexts.join(" ");

  // Nearest heading item at or before the current one = the section.
  let heading: string | null = null;
  for (let i = itemIndex; i >= 0; i--) {
    if (items[i].kind === "heading") {
      heading = items[i].text;
      break;
    }
  }

  const contextText =
    `Book: ${title}\n` +
    (heading ? `Section: ${heading}\n` : "") +
    `You are on page ${page + 1} of ${pages}. ` +
    `The sentence you are reading is marked with >>> <<<.\n\n` +
    (prevPageText ? `--- Previous page ---\n${prevPageText}\n\n` : "") +
    `--- Current page ---\n${marked}\n\n` +
    (nextPageText ? `--- Next page ---\n${nextPageText}` : "");

  return {
    title,
    heading,
    page: page + 1,
    pages,
    prevPageText,
    currentPageText,
    nextPageText,
    markedPageText: marked,
    contextText,
    systemInstruction: ASK_SYSTEM,
  };
}

/**
 * Find the quoted passage in the book (exact match against an item's text,
 * falling back to an exact part-text match). Used to make «quotes» in AI
 * answers tappable jump targets.
 */
export function findQuote(
  quote: string,
  items: Item[],
  partsOf: (itemIndex: number) => string[],
): { item: number; part: number } | null {
  const q = quote.trim();
  if (!q) return null;
  for (let i = 0; i < items.length; i++) {
    if (items[i].text.trim() === q) return { item: i, part: 0 };
  }
  for (let i = 0; i < items.length; i++) {
    const parts = partsOf(i);
    for (let p = 0; p < parts.length; p++) {
      if (parts[p].trim() === q) return { item: i, part: p };
    }
  }
  return null;
}

/** Split an AI answer into text and «quoted» segments for rendering. */
export function splitQuotes(text: string): Array<
  { kind: "text"; text: string } | { kind: "quote"; text: string }
> {
  const out: Array<
    { kind: "text"; text: string } | { kind: "quote"; text: string }
  > = [];
  const re = /«([^»]*)»/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push({ kind: "quote", text: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out.filter((s) => s.text.length > 0);
}
