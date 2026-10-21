// The streaming answer (v4.13).
//
// The reader must see the answer arrive — not wait for it and then see
// it all at once. So the tests feed a stream that is cut in the wrong
// place (mid-frame), and check that the words still come out in order.
import { beforeEach, describe, expect, it } from "vitest";
import { aiStream } from "../src/lib/aiStream";
import { GeminiError } from "../src/lib/errors";

/** A response whose body is the given pieces of text. */
function sseResponse(
  chunks: string[],
  init?: { ok?: boolean; status?: number; json?: object },
): Response {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    body,
    json: async () => init?.json ?? {},
  } as unknown as Response;
}

const geminiFrame = (text: string) =>
  `data: ${JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  })}\n\n`;

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("the stream", () => {
  it("gives the tokens one by one", async () => {
    const fetchFn = (async () =>
      sseResponse([
        geminiFrame("Hello"),
        geminiFrame(", world."),
        "data: [DONE]\n\n",
      ])) as unknown as typeof fetch;
    const tokens: string[] = [];
    const text = await aiStream({
      apiKey: "key",
      messages: [{ role: "user", text: "hi" }],
      onToken: (t) => tokens.push(t),
      fetchFn,
    });
    expect(tokens).toEqual(["Hello", ", world."]);
    expect(text).toBe("Hello, world.");
  });

  it("puts a frame back together when it arrives in pieces", async () => {
    const frame = geminiFrame("split");
    const cut = Math.floor(frame.length / 2);
    const fetchFn = (async () =>
      sseResponse([frame.slice(0, cut), frame.slice(cut), "data: [DONE]\n\n"])) as unknown as typeof fetch;
    const tokens: string[] = [];
    await aiStream({
      apiKey: "key",
      messages: [{ role: "user", text: "hi" }],
      onToken: (t) => tokens.push(t),
      fetchFn,
    });
    expect(tokens).toEqual(["split"]);
  });

  it("leaves the thoughts of a thinking model alone", async () => {
    const frame = `data: ${JSON.stringify({
      candidates: [{ content: { parts: [{ text: "hmm", thought: true }] } }],
    })}\n\n`;
    const fetchFn = (async () =>
      sseResponse([frame, geminiFrame("answer"), "data: [DONE]\n\n"])) as unknown as typeof fetch;
    const tokens: string[] = [];
    await aiStream({
      apiKey: "key",
      messages: [{ role: "user", text: "hi" }],
      onToken: (t) => tokens.push(t),
      fetchFn,
    });
    expect(tokens).toEqual(["answer"]);
  });

  it("stops at [DONE]", async () => {
    const fetchFn = (async () =>
      sseResponse([geminiFrame("one"), "data: [DONE]\n\n", geminiFrame("two")])) as unknown as typeof fetch;
    const tokens: string[] = [];
    await aiStream({
      apiKey: "key",
      messages: [{ role: "user", text: "hi" }],
      onToken: (t) => tokens.push(t),
      fetchFn,
    });
    expect(tokens).toEqual(["one"]);
  });

  it("says so when the AI sends no stream", async () => {
    const fetchFn = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({}),
      }) as unknown as Response) as unknown as typeof fetch;
    await expect(
      aiStream({
        apiKey: "key",
        messages: [{ role: "user", text: "hi" }],
        onToken: () => {},
        fetchFn,
      }),
    ).rejects.toBeInstanceOf(GeminiError);
  });
});

describe("the failures", () => {
  it("maps a rate limit to the quota error", async () => {
    const fetchFn = (async () =>
      sseResponse([], {
        ok: false,
        status: 429,
        json: { error: { code: 429, message: "quota exceeded" } },
      })) as unknown as typeof fetch;
    await expect(
      aiStream({
        apiKey: "key",
        messages: [{ role: "user", text: "hi" }],
        onToken: () => {},
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: "quota" });
  });

  it("maps a rejected key to the invalid-key error", async () => {
    const fetchFn = (async () =>
      sseResponse([], {
        ok: false,
        status: 401,
        json: { error: { code: 401, message: "API key not valid" } },
      })) as unknown as typeof fetch;
    await expect(
      aiStream({
        apiKey: "bad",
        messages: [{ role: "user", text: "hi" }],
        onToken: () => {},
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: "invalid-key" });
  });

  it("falls back to OpenRouter when Gemini fails before the first token", async () => {
    localStorage.setItem("lr-openrouter-key", "sk-or-test");
    const seen: string[] = [];
    const fetchFn = (async (url: string) => {
      seen.push(url);
      if (url.includes("generativelanguage")) {
        return sseResponse([], {
          ok: false,
          status: 401,
          json: { error: { code: 401, message: "API key not valid" } },
        });
      }
      return sseResponse([
        `data: ${JSON.stringify({
          choices: [{ delta: { content: "from openrouter" } }],
        })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    }) as unknown as typeof fetch;
    const tokens: string[] = [];
    const text = await aiStream({
      apiKey: "bad",
      messages: [{ role: "user", text: "hi" }],
      onToken: (t) => tokens.push(t),
      fetchFn,
    });
    expect(text).toBe("from openrouter");
    expect(tokens).toEqual(["from openrouter"]);
    expect(seen.some((u) => u.includes("openrouter"))).toBe(true);
  });

  it("does not fall back once a token has been shown", async () => {
    localStorage.setItem("lr-openrouter-key", "sk-or-test");
    const seen: string[] = [];
    // The stream breaks half way through — after a word was shown.
    const fetchFn = (async (url: string) => {
      seen.push(url);
      const encoder = new TextEncoder();
      let pulls = 0;
      const body = new ReadableStream({
        pull(controller) {
          pulls += 1;
          if (pulls === 1) {
            controller.enqueue(encoder.encode(geminiFrame("half")));
            return;
          }
          controller.error(new Error("the stream broke"));
        },
      });
      return {
        ok: true,
        status: 200,
        body,
        json: async () => ({}),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    await expect(
      aiStream({
        apiKey: "key",
        messages: [{ role: "user", text: "hi" }],
        onToken: () => {},
        fetchFn,
      }),
    ).rejects.toThrow();
    expect(seen.some((u) => u.includes("openrouter"))).toBe(false);
  });
});
