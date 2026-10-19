import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  pickModel,
  discoverModel,
  storedModel,
  testApiKey,
  geminiGenerate,
} from "../src/lib/gemini";

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

const names = (...ns: string[]) => ns;

describe("pickModel", () => {
  it("prefers gemini-3.5-flash over 2.5-flash", () => {
    expect(
      pickModel(names("gemini-2.5-flash", "gemini-3.5-flash")),
    ).toBe("gemini-3.5-flash");
  });

  it("deprioritises preview and lite within a tier", () => {
    expect(
      pickModel(
        names(
          "gemini-3.5-flash-preview",
          "gemini-3.5-flash",
          "gemini-3.5-flash-lite",
        ),
      ),
    ).toBe("gemini-3.5-flash");
  });

  it("falls back down the tiers and ignores non-flash models", () => {
    expect(
      pickModel(names("gemini-2.5-pro", "gemini-2.0-flash")),
    ).toBe("gemini-2.0-flash");
    expect(pickModel(names("gemini-2.5-pro"))).toBe("gemini-2.5-pro");
  });

  it("puts the gemini-flash-latest alias second, behind 3.5-flash", () => {
    expect(
      pickModel(
        names("gemini-2.5-flash", "gemini-flash-latest", "gemini-3-flash"),
      ),
    ).toBe("gemini-flash-latest");
    expect(
      pickModel(names("gemini-flash-latest", "gemini-3.5-flash")),
    ).toBe("gemini-3.5-flash");
  });

  it("returns null for an empty list", () => {
    expect(pickModel([])).toBeNull();
  });
});

function stubFetch(handler: (url: string) => unknown) {
  return vi.fn(async (url: string, _init?: unknown) => {
    const r = handler(url);
    if (r === "network-error") throw new TypeError("offline");
    if (r === 404)
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    return { ok: true, status: 200, json: async () => r } as Response;
  }) as unknown as typeof fetch;
}

const MODELS_PAYLOAD = {
  models: [
    {
      name: "models/gemini-2.5-flash",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.5-flash",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.5-flash-preview",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-2.5-pro",
      supportedGenerationMethods: ["generateContent", "countTokens"],
    },
    { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
  ],
};

function genAnswer(text: string) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
  };
}

describe("discoverModel", () => {
  it("discovers gemini-3.5-flash from the models list and stores it", async () => {
    const f = stubFetch((url) =>
      url.includes("/models?") ? MODELS_PAYLOAD : genAnswer("ok"),
    );
    const picked = await discoverModel("KEY", f);
    expect(picked).toBe("gemini-3.5-flash");
    expect(storedModel()).toBe("gemini-3.5-flash");
  });

  it("returns null when the key is rejected", async () => {
    const f = stubFetch(() => 404);
    expect(await discoverModel("BAD", f)).toBeNull();
  });
});

describe("testApiKey", () => {
  it("reports the discovered model on success", async () => {
    const f = stubFetch((url) =>
      url.includes("/models?") ? MODELS_PAYLOAD : genAnswer("ok"),
    );
    const r = await testApiKey("KEY", f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.model).toBe("gemini-3.5-flash");
  });

  it("reports a reason when no model is available", async () => {
    const f = stubFetch(() => 404);
    const r = await testApiKey("BAD", f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/didn't unlock/i);
  });
});

describe("geminiGenerate 404 recovery", () => {
  it("re-discovers once and retries after a stale model 404s", async () => {
    // A stale stored model (his gemini-2.5-flash 404): generateContent
    // fails, the client re-discovers and retries exactly once.
    try {
      localStorage.setItem("lr-gemini-model", "gemini-2.5-flash");
    } catch {
      /* ignore */
    }
    const f = stubFetch((url) => {
      if (url.includes("/models?")) return MODELS_PAYLOAD;
      if (url.includes("gemini-2.5-flash:generateContent")) return 404;
      if (url.includes("gemini-3.5-flash:generateContent"))
        return genAnswer("hello");
      return 404;
    });
    const text = await geminiGenerate({
      key: "KEY",
      messages: [{ role: "user", text: "hi" }],
      fetchFn: f,
    });
    expect(text).toBe("hello");
    // The working model is remembered for the next call.
    expect(storedModel()).toBe("gemini-3.5-flash");
  });

  it("falls back to the gemini-flash-latest alias when discovery finds nothing", async () => {
    // v4.2: stale stored model 404s AND models.list fails — the documented
    // rolling alias is tried once before any error surfaces.
    try {
      localStorage.setItem("lr-gemini-model", "gemini-2.5-flash");
    } catch {
      /* ignore */
    }
    const f = stubFetch((url) => {
      if (url.includes("/models?")) return 404; // discovery fails
      if (url.includes("gemini-2.5-flash:generateContent")) return 404;
      if (url.includes("gemini-flash-latest:generateContent"))
        return genAnswer("alias-ok");
      return 404;
    });
    const text = await geminiGenerate({
      key: "KEY",
      messages: [{ role: "user", text: "hi" }],
      fetchFn: f,
    });
    expect(text).toBe("alias-ok");
    // The alias proved working, so it is remembered for the next call.
    expect(storedModel()).toBe("gemini-flash-latest");
  });

  it("calls the alias directly when discovery is unavailable from the start", async () => {
    // No stored model, discovery 404s: the very first call goes to the alias.
    const seen: string[] = [];
    const f = stubFetch((url) => {
      seen.push(url);
      if (url.includes("/models?")) return 404;
      if (url.includes("gemini-flash-latest:generateContent"))
        return genAnswer("first-call");
      return 404;
    });
    const text = await geminiGenerate({
      key: "KEY",
      messages: [{ role: "user", text: "hi" }],
      fetchFn: f,
    });
    expect(text).toBe("first-call");
    expect(
      seen.some((u) => u.includes("gemini-flash-latest:generateContent")),
    ).toBe(true);
  });

  it("only surfaces an error after the alias also fails", async () => {
    try {
      localStorage.setItem("lr-gemini-model", "gemini-2.5-flash");
    } catch {
      /* ignore */
    }
    const f = stubFetch(() => 404); // everything 404s: generate + list
    await expect(
      geminiGenerate({
        key: "KEY",
        messages: [{ role: "user", text: "hi" }],
        fetchFn: f,
      }),
    ).rejects.toMatchObject({ code: "unknown" });
  });

  it("retries once on a network failure, then succeeds", async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => genAnswer("retry-ok"),
      }));
    const text = await geminiGenerate({
      key: "KEY",
      model: "gemini-flash-latest", // skips discovery — isolates the retry
      messages: [{ role: "user", text: "hi" }],
      fetchFn: f as unknown as typeof fetch,
    });
    expect(text).toBe("retry-ok");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("throws a network error after both attempts fail", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("offline");
    });
    await expect(
      geminiGenerate({
        key: "KEY",
        model: "gemini-flash-latest",
        messages: [{ role: "user", text: "hi" }],
        fetchFn: f as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "network" });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("surfaces Google's own error message next to the mapped message", async () => {
    const f = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "API key not valid. Please pass a valid API key.",
        },
      }),
    }));
    await expect(
      geminiGenerate({
        key: "BAD",
        model: "gemini-flash-latest",
        messages: [{ role: "user", text: "hi" }],
        fetchFn: f as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "invalid-key",
      // Diagnosable from a screenshot: the raw Google text is embedded.
      message: expect.stringContaining("Google: API key not valid."),
    });
  });

  it("reports MAX_TOKENS when thinking consumes the whole budget", async () => {
    // v4.4: a thinking model fills the candidate with thoughts only, so the
    // visible text is empty and the finishReason must reach the caller.
    const f = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ thought: true }] },
            finishReason: "MAX_TOKENS",
          },
        ],
      }),
    }));
    await expect(
      geminiGenerate({
        key: "test-key-0001",
        model: "gemini-3.5-flash",
        messages: [{ role: "user", text: "Reply with exactly this word: ok" }],
        fetchFn: f as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "unknown",
      message: expect.stringContaining("MAX_TOKENS"),
    });
  });
});
