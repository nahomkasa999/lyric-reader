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
});
