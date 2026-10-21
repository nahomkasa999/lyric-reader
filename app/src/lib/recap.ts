// The recap (v4.13): "what has happened so far?"
//
// The answer comes from the passages the reader has ALREADY read — the
// ones up to the page they are on. Nothing later is in the sample, so
// the recap cannot spoil the book.
//
// The sampling is pure, so it can be tested without a model: even out
// over the read range, always keep the last few passages, never more
// than a char budget.
import { aiGenerate, GeminiError } from "./ai";
import type { Passage } from "./assistantContext";
import { passagesOfBook } from "./passages";
import type { StoredChunk } from "./vectorStore";

/** How many characters of passages the recap may carry. */
export const RECAP_CHARS = 12_000;

/** How many passages the recap may carry. */
export const RECAP_PASSAGES = 12;

/** The last passages are always kept — the end of the read range. */
const KEEP_LAST = 4;

/**
 * Sample the passages the reader has read.
 *
 * Evenly spread over the read range, with the last few always in, and
 * never more than the budget allows.
 */
export function sampleRecap(
  chunks: StoredChunk[],
  maxItem: number,
  charBudget: number = RECAP_CHARS,
): StoredChunk[] {
  const read = chunks
    .filter((c) => c.from <= maxItem)
    .sort((a, b) => a.from - b.from);
  if (!read.length) return [];

  const limit = Math.min(RECAP_PASSAGES, read.length);
  const tailCount = Math.min(KEEP_LAST, limit);
  const tail = read.slice(read.length - tailCount);
  const rest = read.slice(0, read.length - tailCount);

  const picked: StoredChunk[] = [...tail];
  let chars = tail.reduce((n, c) => n + c.text.length, 0);

  const room = limit - tail.length;
  if (room > 0 && rest.length) {
    const step = rest.length / room;
    for (let i = 0; i < room; i++) {
      const chunk = rest[Math.floor(i * step)];
      if (!chunk) continue;
      if (chars + chunk.text.length > charBudget) continue;
      picked.push(chunk);
      chars += chunk.text.length;
    }
  }
  picked.sort((a, b) => a.from - b.from);
  return picked;
}

/** The system prompt of the recap. */
export const RECAP_SYSTEM =
  "Summarise what the reader has read so far in this book, in their " +
  "language, in 6 short bullets. Use only the passages. No spoilers " +
  "past the reader's page.";

/**
 * Recap what the reader has read so far.
 *
 * Nothing read yet is not an error the model can help with — it is
 * said plainly.
 */
export async function recapReadSoFar(opts: {
  bookId: string;
  maxItem: number;
  key: string;
  title?: string;
}): Promise<{ text: string; passages: Passage[] }> {
  const chunks = await passagesOfBook(opts.bookId);
  const sample = sampleRecap(chunks, opts.maxItem);
  if (!sample.length) {
    throw new GeminiError(
      "unknown",
      "Nothing read yet — the recap starts once you read a page.",
    );
  }
  const title = opts.title ?? "the book";
  const passages: Passage[] = sample.map((c) => ({
    bookTitle: title,
    heading: c.heading,
    page: c.page,
    text: c.text,
  }));
  const block = passages
    .map((p, i) => `[${i + 1}] ${p.heading || title} (p.${p.page})\n${p.text}`)
    .join("\n\n");
  const text = await aiGenerate({
    apiKey: opts.key,
    system: RECAP_SYSTEM,
    messages: [
      {
        role: "user",
        text: `PASSAGES FROM WHAT THE READER HAS READ SO FAR:\n${block}\n\nMY QUESTION: What has happened so far?`,
      },
    ],
    maxTokens: 900,
  });
  return { text: text.trim(), passages };
}
