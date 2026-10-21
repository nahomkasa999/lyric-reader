// Embeddings (v4.13): the vectors behind the knowledge base.
//
// Gemini's own embedding model, with the same key the app already uses
// (lib/apikey.ts) and the same failure mapping as lib/gemini.ts.
//
//   gemini-embedding-001 · 768 dimensions (Matryoshka truncation —
//   Google's own recommendation: a quarter of the size and four times
//   faster to scan than the full 3072, for almost no quality loss).
//
// Two task types, and the difference matters:
//   RETRIEVAL_DOCUMENT for the passages, RETRIEVAL_QUERY for the
//   question. Embedding a question the way you embed a document is the
//   classic way to make a search feel wrong.
//
// The BATCH endpoint is the one to use for passages: one request per
// passage, all of them in one call. The old code put twenty passages
// into ONE `content.parts` — Google answered with a single vector for
// twenty passages, and the library was silently unsearchable.
import { GeminiError, fetchTolerant } from "./gemini";
import { EMBED_BATCH } from "./indexPlan";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBED_URL = `${API}/${EMBED_MODEL}:embedContent`;
const BATCH_URL = `${API}/${EMBED_MODEL}:batchEmbedContents`;

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

interface EmbedResponse {
  embedding?: { values?: number[] };
  embeddings?: Array<{ values?: number[] }>;
  error?: { code?: number; message?: string };
}

function isAbortName(name: string): boolean {
  return name === "AbortError";
}

/**
 * Normalize a vector to length 1.
 *
 * gemini-embedding-001 only normalizes its full 3072 dimensions — at 768
 * you must do it yourself, or the cosine compares lengths as well as
 * directions and the ranking drifts.
 */
export function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const n = Math.sqrt(sum);
  if (!n) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

async function post(
  url: string,
  body: object,
  key: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<EmbedResponse> {
  let res: Response;
  try {
    res = await fetchTolerant(fetchFn, url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
    }, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new GeminiError(
      "network",
      isAbortName(e instanceof Error ? e.name : "")
        ? "The embedding request took too long — check your connection."
        : "Couldn't reach Google's servers — check your connection.",
    );
  }
  let data: EmbedResponse;
  try {
    data = (await res.json()) as EmbedResponse;
  } catch {
    throw new GeminiError("unknown", "Got an unreadable reply from the AI.");
  }
  if (!res.ok) {
    const code = data.error?.code ?? res.status;
    const raw = String(data.error?.message ?? "").replace(/\s+/g, " ").trim();
    const suffix = raw ? ` (Google: ${raw.slice(0, 120)})` : "";
    if (code === 400 || /key/i.test(raw))
      throw new GeminiError(
        "invalid-key",
        "That key didn't work for embeddings — check it in Settings." + suffix,
      );
    if (code === 429 || code === 503)
      throw new GeminiError(
        "quota",
        "The AI is rate-limited right now — wait a little and retry." + suffix,
      );
    throw new GeminiError(
      "unknown",
      `The embedding request failed (${code}).` + suffix,
    );
  }
  return data;
}

/** Read the vectors out of a reply, whichever shape it came in. */
function vectorsOf(data: EmbedResponse): number[][] {
  if (Array.isArray(data.embeddings))
    return data.embeddings.map((e) => e?.values ?? []).filter((v) => v.length > 0);
  const one = data.embedding?.values;
  return one && one.length ? [one] : [];
}

/** The body of ONE embedding request — never two texts in one. */
function singleBody(text: string, task: EmbedTask): object {
  return {
    content: { parts: [{ text }] },
    taskType: task,
    outputDimensionality: EMBED_DIM,
  };
}

/**
 * Embed a list of texts, one request per text.
 *
 * The safe path: one passage, one request. It is slower than the batch
 * endpoint, but it can never come back with the wrong number of
 * vectors.
 */
async function embedOneByOne(
  texts: string[],
  task: EmbedTask,
  key: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (const text of texts) {
    const data = await post(
      EMBED_URL,
      singleBody(text, task),
      key,
      fetchFn,
      signal,
    );
    const one = vectorsOf(data);
    if (!one.length)
      throw new GeminiError("unknown", "The AI sent back an empty vector.");
    out.push(normalize(new Float32Array(one[0])));
  }
  return out;
}

/**
 * Embed a list of texts with the batch endpoint.
 *
 * One `requests[]` entry per text — that is the shape Google expects.
 * If the answer does not hold exactly one vector per request, the batch
 * is retried one text at a time: not a guess.
 */
async function embedInBatch(
  texts: string[],
  task: EmbedTask,
  key: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<Float32Array[]> {
  const body = {
    requests: texts.map((text) => ({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType: task,
      outputDimensionality: EMBED_DIM,
    })),
  };
  const data = await post(BATCH_URL, body, key, fetchFn, signal);
  const vectors = vectorsOf(data);
  if (vectors.length !== texts.length) {
    return embedOneByOne(texts, task, key, fetchFn, signal);
  }
  return vectors.map((v) => normalize(new Float32Array(v)));
}

/**
 * Embed a list of texts.
 *
 * A question is one text: it goes to the single endpoint. Passages go
 * in batches, and fall back to one request each when the batch comes
 * back with the wrong shape.
 */
export async function embedTexts(
  texts: string[],
  task: EmbedTask,
  key: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Float32Array[]> {
  if (!texts.length) return [];
  if (task === "RETRIEVAL_QUERY") {
    return embedOneByOne(texts, task, key, fetchFn, signal);
  }
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const slice = texts.slice(i, i + EMBED_BATCH);
    const batch = await embedInBatch(slice, task, key, fetchFn, signal);
    out.push(...batch);
  }
  return out;
}

/** Embed one question. */
export async function embedQuery(
  question: string,
  key: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Float32Array | null> {
  const [v] = await embedTexts(
    [question],
    "RETRIEVAL_QUERY",
    key,
    fetchFn,
    signal,
  );
  return v ?? null;
}
