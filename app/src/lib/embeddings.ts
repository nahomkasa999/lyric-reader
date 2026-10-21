// Embeddings (v4.12): the vectors behind the knowledge base.
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
import { GeminiError, fetchTolerant } from "./gemini";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768;

/** How many passages go into one request. */
const BATCH = 20;

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

interface EmbedResponse {
  embedding?: { values?: number[] };
  embeddings?: Array<{ values?: number[] }>;
  error?: { code?: number; message?: string };
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
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
  body: unknown,
  key: string,
  fetchFn: typeof fetch,
): Promise<EmbedResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;
  let res: Response;
  try {
    res = await fetchTolerant(fetchFn, url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new GeminiError(
      "network",
      isAbort(e)
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
    return data.embeddings
      .map((e) => e?.values ?? [])
      .filter((v) => v.length > 0);
  const one = data.embedding?.values;
  return one && one.length ? [one] : [];
}

/**
 * Embed a list of texts.
 *
 * One request carries a batch of passages; if the API answers with a
 * single vector for a batch of texts (the shape differs between
 * embedding models), the batch is split and asked again, one text at a
 * time. That has happened before; it must not silently return one
 * vector for twenty passages.
 */
export async function embedTexts(
  texts: string[],
  task: EmbedTask,
  key: string,
  fetchFn: typeof fetch = fetch,
): Promise<Float32Array[]> {
  if (!texts.length) return [];
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const data = await post(
      {
        content: { parts: slice.map((text) => ({ text })) },
        taskType: task,
        outputDimensionality: EMBED_DIM,
      },
      key,
      fetchFn,
    );
    const vectors = vectorsOf(data);
    if (vectors.length === slice.length) {
      for (const v of vectors) out.push(normalize(new Float32Array(v)));
      continue;
    }
    // The shape did not match: one text per request, no guessing.
    for (const text of slice) {
      const single = await post(
        {
          content: { parts: [{ text }] },
          taskType: task,
          outputDimensionality: EMBED_DIM,
        },
        key,
        fetchFn,
      );
      const one = vectorsOf(single);
      if (!one.length)
        throw new GeminiError("unknown", "The AI sent back an empty vector.");
      out.push(normalize(new Float32Array(one[0])));
    }
  }
  return out;
}

/** Embed one question. */
export async function embedQuery(
  question: string,
  key: string,
  fetchFn: typeof fetch = fetch,
): Promise<Float32Array | null> {
  const [v] = await embedTexts([question], "RETRIEVAL_QUERY", key, fetchFn);
  return v ?? null;
}
