// The assistant's prompt (v4.12) — pure, so it can be tested.
//
// Three things go in:
//  1. the passages the search found (the only thing the answer may use);
//  2. the recent messages of this thread, verbatim;
//  3. a digest of the older messages — the questions that were already
//     asked, so a follow-up like "and why?" still knows what it is about.
//
// (2) is capped and (3) replaces everything older, so the prompt NEVER
// grows without bound — that is the "the chart is going really large"
// fix, done in the one place that decides what the model sees.
import type { AssistantMessage } from "./assistantStore";
import type { SearchHit } from "./vectorIndex";

export const ASSISTANT_SYSTEM =
  "You are the reader's assistant. You answer from the PASSAGES below, " +
  "which come from the reader's own books. Use nothing else: if the " +
  "passages do not contain the answer, say plainly that the library " +
  "does not say, and name the books the passages do come from. " +
  "When you rely on a passage, quote its exact words in « » so the " +
  "reader can jump to them. Answer in the language of the question.";

/** How many messages of the thread are sent verbatim. */
export const RECENT_MESSAGES = 10;

/** One passage, ready to be shown to the model. */
export interface Passage {
  bookTitle: string;
  heading: string;
  page: number;
  text: string;
}

/**
 * The digest of the messages that fell out of the recent window.
 *
 * It is mechanical on purpose: the reader's own earlier questions,
 * listed. No extra model call, no summary that can invent something.
 */
export function digestOf(messages: AssistantMessage[]): string {
  const older = messages.slice(0, Math.max(0, messages.length - RECENT_MESSAGES));
  const questions = older
    .filter((m) => m.role === "user")
    .map((m) => m.text.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((q) => (q.length > 90 ? `${q.slice(0, 90)}…` : q));
  if (!questions.length) return "";
  return `Earlier in this thread the reader asked: ${questions.join(" | ")}.`;
}

/** The passages, as the model should see them. */
export function passageBlock(passages: Passage[]): string {
  return passages
    .map((p, i) => {
      const where = p.heading
        ? `${p.bookTitle} › ${p.heading} (p.${p.page})`
        : `${p.bookTitle} (p.${p.page})`;
      return `[${i + 1}] ${where}\n${p.text}`;
    })
    .join("\n\n");
}

export interface AssistantPrompt {
  system: string;
  /** the messages to send, in order */
  messages: Array<{ role: "user" | "model"; text: string }>;
}

/**
 * Build the prompt for one question.
 *
 * The passages come first — they are the ground truth — and the question
 * comes last, so the model reads the evidence before it reads the ask.
 */
export function buildAssistantPrompt(
  question: string,
  passages: Passage[],
  history: AssistantMessage[],
): AssistantPrompt {
  const recent = history.slice(-RECENT_MESSAGES);
  const digest = digestOf(history);
  const messages: Array<{ role: "user" | "model"; text: string }> = [];

  for (const m of recent) {
    messages.push({
      role: m.role === "ai" ? "model" : "user",
      text: m.text,
    });
  }

  const parts: string[] = [];
  if (digest) parts.push(digest);
  if (passages.length) {
    parts.push(
      `PASSAGES FROM THE READER'S BOOKS:\n${passageBlock(passages)}`,
    );
  } else {
    parts.push(
      "PASSAGES FROM THE READER'S BOOKS: none found. Say that the library " +
        "does not contain the answer.",
    );
  }
  parts.push(`MY QUESTION: ${question}`);

  messages.push({ role: "user", text: parts.join("\n\n") });
  return { system: ASSISTANT_SYSTEM, messages };
}

/** The passages a search found, with the books they came from. */
export function passagesOf(
  hits: SearchHit[],
  titles: Map<string, string>,
): Passage[] {
  return hits.map((h) => ({
    bookTitle: titles.get(h.chunk.bookId) ?? "Your book",
    heading: h.chunk.heading,
    page: h.chunk.page,
    text: h.chunk.text,
  }));
}
