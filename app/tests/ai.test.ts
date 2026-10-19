import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiGenerate } from "../src/lib/ai";
import { setOpenRouterKey } from "../src/lib/openrouter";

const OR_KEY = "sk-or-test-0001";

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  vi.stubEnv("VITE_GEMINI_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type Reply = { ok: boolean; status: number; payload: unknown };

/** Fake fetch routed by URL: no network, every call recorded. */
function stubFetch(route: (url: string) => Reply) {
  const mock = vi.fn(async (url: string, _init: RequestInit) => {
    const r = route(url);
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.payload,
    } as Response;
  });
  return { mock, fetchFn: mock as unknown as typeof fetch };
}

const urls = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((c) => String(c[0]));

const MODELS_PAYLOAD = {
  models: [
    {
      name: "models/gemini-3.5-flash",
      supportedGenerationMethods: ["generateContent"],
    },
  ],
};

const geminiOk = (text: string): Reply => ({
  ok: true,
  status: 200,
  payload: { candidates: [{ content: { parts: [{ text }] } }] },
});

const geminiFail = (): Reply => ({
  ok: false,
  status: 400,
  payload: { error: { code: 400, message: "API key not valid." } },
});

const openrouterOk = (text: string): Reply => ({
  ok: true,
  status: 200,
  payload: { choices: [{ message: { content: text } }] },
});

describe("aiGenerate routing", () => {
  it("falls back to OpenRouter when Gemini throws, and returns its text", async () => {
    setOpenRouterKey(OR_KEY);
    const { mock, fetchFn } = stubFetch((url) => {
      if (url.includes("openrouter.ai")) return openrouterOk("or-answer");
      if (url.includes("/models?")) return { ...geminiOk(""), payload: MODELS_PAYLOAD };
      return geminiFail();
    });
    const text = await aiGenerate({
      apiKey: "test-gemini-key-0001",
      messages: [{ role: "user", text: "hi" }],
      fetchFn,
    });
    expect(text).toBe("or-answer");
    expect(urls(mock).some((u) => u.includes("openrouter.ai"))).toBe(true);
  });

  it("does not call OpenRouter when Gemini succeeds", async () => {
    const { mock, fetchFn } = stubFetch((url) => {
      if (url.includes("openrouter.ai")) return openrouterOk("or-answer");
      if (url.includes("/models?")) return { ...geminiOk(""), payload: MODELS_PAYLOAD };
      return geminiOk("gemini-answer");
    });
    const text = await aiGenerate({
      apiKey: "test-gemini-key-0001",
      messages: [{ role: "user", text: "hi" }],
      fetchFn,
    });
    expect(text).toBe("gemini-answer");
    expect(urls(mock).some((u) => u.includes("openrouter.ai"))).toBe(false);
  });

  it("uses a saved OpenRouter key directly when there is no Gemini key", async () => {
    setOpenRouterKey(OR_KEY);
    const { mock, fetchFn } = stubFetch((url) => {
      if (url.includes("openrouter.ai")) return openrouterOk("or-only");
      return geminiFail();
    });
    const text = await aiGenerate({
      messages: [{ role: "user", text: "hi" }],
      fetchFn,
    });
    expect(text).toBe("or-only");
    expect(urls(mock).filter((u) => u.includes("openrouter.ai"))).toHaveLength(1);
    expect(urls(mock).some((u) => u.includes("generativelanguage"))).toBe(false);
  });
});
