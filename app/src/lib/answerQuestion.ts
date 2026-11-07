// The answer pipeline (v4.13) — one question, one answer.
//
// The steps, in order:
//   1. embed the question (a failure is not fatal — the words work);
//   2. find the passages, stopping at the reader's page;
//   3. build the prompt — the passages and nothing else;
//   4. ask the model.
//
// It is all here, out of the React hook, so the hook only has to hold
// the state.
import { aiStream } from "./aiStream";
import { embedQuery } from "./embeddings";
import { listBooks } from "./db";
import {
  buildAssistantPrompt,
  passagesOf,
  type ReaderContext,
} from "./assistantContext";
import { retrieve } from "./retrieval";
import type { AssistantMessage, Source } from "./assistantStore";

/** The output budget of one answer — thoughts and text together. */
export const ANSWER_TOKENS = 3000;

export interface AnswerRequest {
  question: string;
  /** the messages before this question */
  history: AssistantMessage[];
  key: string;
  /** the book on screen */
  bookId?: string;
  bookTitle?: string;
  /** the item the reader is on */
  item?: number;
  /** may the answer reach past the reader's page? */
  spoilers: boolean;
  /** the tokens are appended here as they arrive */
  onToken?: (token: string) => void;
  /** the request was stopped */
  signal?: AbortSignal;
}

export interface AnswerResult {
  text: string;
  sources: Source[];
}

/** A question this short leans on the conversation: "and why?", "who else?". */
const FOLLOW_UP_WORDS = 8;

/** How many earlier questions the search borrows. */
const SEARCH_HISTORY = 2;

/**
 * The words the SEARCH uses for a question.
 *
 * A follow-up ("and why?") means nothing alone, so the search of a short
 * question is made from the reader's recent questions plus the new one —
 * the same context the model gets in the prompt. A full question stands
 * by itself, so an unrelated earlier topic cannot pull the search away.
 * The model still receives the original question, unchanged.
 */
export function searchQueryFor(
  question: string,
  history: AssistantMessage[],
): string {
  const q = question.trim();
  if (q.split(/\s+/).filter(Boolean).length > FOLLOW_UP_WORDS) return q;
  const before = history
    .filter((m) => m.role === "user")
    .slice(-SEARCH_HISTORY)
    .map((m) => m.text.trim())
    .filter(Boolean);
  return before.length ? `${before.join(" ")} ${q}` : q;
}

/** Find the passages and ask the model about them. */
export async function answerQuestion(
  req: AnswerRequest,
): Promise<AnswerResult> {
  // 1. The question's own vector. A failure is not fatal: the keyword
  //    lane still finds the passage.
  //    The search reads the question WITH its history, like a RAG chat.
  const searchQuery = searchQueryFor(req.question, req.history);
  let vector: Float32Array | null = null;
  try {
    vector = await embedQuery(searchQuery, req.key, fetch, req.signal);
  } catch (e) {
    // A stopped request must not fall through to the words.
    if (req.signal?.aborted) throw e;
    // No embedding (offline, no quota): the words still work.
    vector = null;
  }

  // 2. The passages — never past the page the reader is on.
  const maxItem = req.spoilers ? undefined : req.item;
  const hits = await retrieve(searchQuery, vector, {
    bookId: req.bookId,
    maxItem,
  });

  // 3. The prompt: the passages, the thread, and where the reader is.
  const books = await listBooks().catch(() => []);
  const titles = new Map(books.map((b) => [b.id, b.title]));
  const passages = passagesOf(hits, titles);
  const ctx: ReaderContext = {
    bookTitle: req.bookTitle,
    readUpToItem: req.item,
  };
  const prompt = buildAssistantPrompt(req.question, passages, req.history, ctx);

  // 4. The model — the answer arrives in pieces.
  const text = await aiStream({
    apiKey: req.key,
    system: prompt.system,
    messages: prompt.messages,
    // A thinking model spends this budget on its thoughts first; 1500 was
    // not enough for a full answer after them.
    maxTokens: ANSWER_TOKENS,
    signal: req.signal,
    onToken: req.onToken ?? (() => {}),
  });

  const sources: Source[] = hits.slice(0, 6).map((h) => ({
    bookId: h.chunk.bookId,
    bookTitle: titles.get(h.chunk.bookId) ?? "Your book",
    heading: h.chunk.heading,
    page: h.chunk.page,
    item: h.chunk.from,
    text: h.chunk.text,
  }));
  return { text: text.trim(), sources };
}
