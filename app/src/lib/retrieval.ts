// The search (v4.13) — two lanes, one ranking.
//
// The old search looked ONLY at the vectors, so a book that had not
// been embedded yet was invisible: a new import, a book indexed by an
// older app, a phone that had never been online. That is the failure
// this module fixes.
//
// Two lanes:
//   · the SEMANTIC lane — cosine over the embeddings, for passages
//     that were embedded;
//   · the KEYWORD lane — the passage's own words, for every passage
//     of every book, indexed or not.
//
// The ranking is pure, so it can be tested without a database:
// rankPassages() is the whole truth, retrieve() only reads the rows.
import { combinedScore, cosine, lexicalScore, wordsOf } from "./vectorScore";
import {
  allChunks,
  allVectors,
  type StoredChunk,
} from "./vectorStore";

/** One passage the search found. */
export interface SearchHit {
  chunk: StoredChunk;
  /** the combined score */
  score: number;
  /** the semantic part */
  semantic: number;
  /** the keyword part */
  lexical: number;
}

export interface RetrieveOpts {
  /** the book on screen — boosted, and the only book the boundary applies to */
  bookId?: string;
  /** the reader's current item index (inclusive); undefined = no boundary */
  maxItem?: number;
  topK?: number;
}

/** How much the open book wins a tie. */
const BOOK_BOOST = 0.06;

/**
 * Rank the passages — pure, so it can be tested on its own.
 *
 * Every passage of every book is a candidate: the keyword lane works
 * whether a passage was embedded or not. A passage scores nothing when
 * it matches neither lane, and it is dropped.
 *
 * The question's own vector is optional: without it the semantic lane
 * is empty and the keyword lane does the work.
 */
export function rankPassages(
  chunks: StoredChunk[],
  vectors: Map<string, Float32Array>,
  question: string,
  opts: RetrieveOpts,
  query: Float32Array | null = null,
): SearchHit[] {
  const topK = opts.topK ?? 8;
  const hits: SearchHit[] = [];
  for (const chunk of chunks) {
    // The boundary: the book on screen must not give away what comes
    // after the page the reader is on. Other books are not filtered —
    // they are separate books the reader added.
    if (
      opts.bookId !== undefined &&
      opts.maxItem !== undefined &&
      chunk.bookId === opts.bookId &&
      chunk.from > opts.maxItem
    ) {
      continue;
    }
    const vector = vectors.get(chunk.id);
    const semantic = query && vector ? cosine(query, vector) : 0;
    const words = chunk.w && chunk.w.length ? chunk.w : wordsOf(chunk.text);
    const lexical = lexicalScore(question, words);
    const base = combinedScore(semantic, lexical);
    if (base <= 0) continue;
    const score =
      opts.bookId !== undefined && chunk.bookId === opts.bookId
        ? base + BOOK_BOOST
        : base;
    hits.push({ chunk, score, semantic, lexical });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}

/**
 * Find the passages that answer a question.
 *
 * Reads everything and embeds nothing: the question's vector is the
 * caller's job, and a missing vector simply leaves the semantic lane
 * empty — the keyword lane still answers.
 */
export async function retrieve(
  question: string,
  query: Float32Array | null,
  opts: RetrieveOpts,
): Promise<SearchHit[]> {
  const chunks = await allChunks();
  if (!chunks.length) return [];
  const rows = await allVectors();
  const vectors = new Map<string, Float32Array>();
  for (const row of rows) {
    if (row?.v) vectors.set(row.id, row.v);
  }
  return rankPassages(chunks, vectors, question, opts, query);
}
