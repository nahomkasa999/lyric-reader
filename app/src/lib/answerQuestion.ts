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

/** Find the passages and ask the model about them. */
export async function answerQuestion(
  req: AnswerRequest,
): Promise<AnswerResult> {
  // 1. The question's own vector. A failure is not fatal: the keyword
  //    lane still finds the passage.
  let vector: Float32Array | null = null;
  try {
    vector = await embedQuery(req.question, req.key);
  } catch {
    vector = null;
  }

  // 2. The passages — never past the page the reader is on.
  const maxItem = req.spoilers ? undefined : req.item;
  const hits = await retrieve(req.question, vector, {
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
    maxTokens: 1500,
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
