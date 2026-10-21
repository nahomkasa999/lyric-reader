// The embedding client (v4.12).
//
// Two things matter here and both are easy to get wrong: the vectors
// must be NORMALIZED (Gemini only normalizes its full 3072 dimensions),
// and a batch must never come back as one vector for twenty passages.
import { describe, it, expect } from "vitest";
import { EMBED_DIM, embedTexts, normalize } from "../src/lib/embeddings";
import { GeminiError } from "../src/lib/gemini";

/** A fetch that answers with the given payloads, in order. */
function mockFetch(payloads: unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = payloads[Math.min(i, payloads.length - 1)];
    i += 1;
    const ok = !(body as { error?: unknown })?.error;
    return {
      ok,
      status: ok ? 200 : 429,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("the vectors", () => {
  it("are normalized to length 1", () => {
    const v = normalize(new Float32Array([3, 4]));
    expect(Math.hypot(v[0], v[1])).toBeCloseTo(1, 6);
  });

  it("come back one per passage", async () => {
    const fetchFn = mockFetch([
      {
        embeddings: [
          { values: [1, 0, 0] },
          { values: [0, 1, 0] },
        ],
      },
    ]);
    const vectors = await embedTexts(
      ["first passage", "second passage"],
      "RETRIEVAL_DOCUMENT",
      "key",
      fetchFn,
    );
    expect(vectors).toHaveLength(2);
    expect(vectors[0][0]).toBeCloseTo(1, 6);
    expect(vectors[1][1]).toBeCloseTo(1, 6);
  });

  it("asks again when the batch answers with one vector", async () => {
    // The shape differs between embedding models: this one answers a
    // batch with a single vector. The client must not pass that off as
    // twenty passages.
    const fetchFn = mockFetch([
      { embedding: { values: [1, 0, 0] } },
      { embedding: { values: [0, 1, 0] } },
      { embedding: { values: [0, 0, 1] } },
    ]);
    const vectors = await embedTexts(
      ["a", "b", "c"],
      "RETRIEVAL_DOCUMENT",
      "key",
      fetchFn,
    );
    expect(vectors).toHaveLength(3);
  });

  it("asks for the size it wants", async () => {
    let seen: { taskType?: string; outputDimensionality?: number } = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        taskType?: string;
        outputDimensionality?: number;
      };
      seen = body;
      return {
        ok: true,
        status: 200,
        json: async () => ({ embeddings: [{ values: [1, 0] }] }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    await embedTexts(["passage"], "RETRIEVAL_QUERY", "key", fetchFn);
    expect(seen.taskType).toBe("RETRIEVAL_QUERY");
    expect(seen.outputDimensionality).toBe(EMBED_DIM);
  });

  it("says what went wrong when the API says no", async () => {
    const fetchFn = mockFetch([
      { error: { code: 429, message: "quota exceeded" } },
    ]);
    await expect(
      embedTexts(["passage"], "RETRIEVAL_DOCUMENT", "key", fetchFn),
    ).rejects.toBeInstanceOf(GeminiError);
  });
});
