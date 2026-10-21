// The scoring of a search (v4.12) — pure, so it can be tested.
//
// Two halves, and the point is that they are different:
//   · the SEMANTIC half (cosine over the embeddings) finds passages that
//     mean the same thing as the question;
//   · the KEYWORD half finds the passages that use the same words —
//     which is how a name like "30th Street" is found at all.
//
// Together they beat either alone. That is the whole point of a hybrid
// search, and it is why the answer is "the right answer" and not "a
// plausible one".

/** Words of length 2+ that carry meaning; the rest are noise. */
const STOP = new Set(
  (
    "the a an and or but of to in on at for with from by as is are was were be been " +
    "it its this that these those he she they we you i his her their our your my " +
    "not no yes so if then than there here what which who whom how why when where"
  ).split(" "),
);

/** The distinct words of a passage, for the keyword half of the search. */
export function wordsOf(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3) continue;
    if (STOP.has(raw)) continue;
    out.add(raw);
    if (out.size >= 60) break;
  }
  return [...out];
}

/** Cosine similarity of two vectors (both are normalized on the way in). */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * The keyword half of the search: how much of the question's wording is
 * in the passage.
 */
export function lexicalScore(question: string, words: string[]): number {
  const q = wordsOf(question);
  if (!q.length || !words.length) return 0;
  const set = new Set(words);
  let hit = 0;
  for (const t of q) if (set.has(t)) hit += 1;
  return hit / q.length;
}

/** Combine the two halves: meaning first, words second. */
export function combinedScore(semantic: number, lexical: number): number {
  return 0.75 * semantic + 0.25 * lexical;
}
