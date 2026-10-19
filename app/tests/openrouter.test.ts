import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPENROUTER_MODEL, openRouterGenerate } from "../src/lib/openrouter";

const KEY = "sk-or-test-0001";
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

type Reply =
  | { kind: "json"; payload: unknown }
  | { kind: "status"; status: number; payload: unknown };

/** Fake fetch: no network, and every call is recorded for assertions. */
function stubFetch(reply: (url: string) => Reply) {
  const mock = vi.fn(async (url: string, _init: RequestInit) => {
    const r = reply(url);
    return {
      ok: r.kind === "json",
      status: r.kind === "json" ? 200 : r.status,
      json: async () => r.payload,
    } as Response;
  });
  return { mock, fetchFn: mock as unknown as typeof fetch };
}

const okText = (text: string): Reply => ({
  kind: "json",
  payload: { choices: [{ message: { content: text } }] },
});

const call = (mock: ReturnType<typeof vi.fn>, i = 0) => mock.mock.calls[i];

describe("openRouterGenerate", () => {
  it("posts to the OpenRouter chat completions endpoint", async () => {
    const { mock, fetchFn } = stubFetch(() => okText("hi"));
    await openRouterGenerate({
      key: KEY,
      messages: [{ role: "user", text: "hi" }],
      fetchFn,
    });
    expect(call(mock)[0]).toBe(OR_URL);
  });

  it("sends the key as a bearer Authorization header", async () => {
    const { mock, fetchFn } = stubFetch(() => okText("hi"));
    await openRouterGenerate({
      key: KEY,
      messages: [{ role: "user", text: "hi" }],
      fetchFn,
    });
    const headers = call(mock)[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("asks for the exported default model", async () => {
    const { mock, fetchFn } = stubFetch(() => okText("hi"));
    await openRouterGenerate({
      key: KEY,
      messages: [{ role: "user", text: "hi" }],
      fetchFn,
    });
    const body = JSON.parse(String(call(mock)[1].body));
    expect(body.model).toBe(OPENROUTER_MODEL);
  });

  it("returns choices[0].message.content", async () => {
    const { fetchFn } = stubFetch(() => okText("from openrouter"));
    const text = await openRouterGenerate({
      key: KEY,
      messages: [{ role: "user", text: "hi" }],
      fetchFn,
    });
    expect(text).toBe("from openrouter");
  });

  it("throws when the content is empty", async () => {
    const { fetchFn } = stubFetch(() => ({
      kind: "json" as const,
      payload: { choices: [{ message: { content: "  " } }] },
    }));
    await expect(
      openRouterGenerate({
        key: KEY,
        messages: [{ role: "user", text: "hi" }],
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: "unknown" });
  });

  it("throws when the content is missing", async () => {
    const { fetchFn } = stubFetch(() => ({
      kind: "json" as const,
      payload: { choices: [] },
    }));
    await expect(
      openRouterGenerate({
        key: KEY,
        messages: [{ role: "user", text: "hi" }],
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: "unknown" });
  });

  it("maps a rejected key to the invalid-key error", async () => {
    const { fetchFn } = stubFetch(() => ({
      kind: "status" as const,
      status: 401,
      payload: { error: { code: 401, message: "No auth credentials found" } },
    }));
    await expect(
      openRouterGenerate({
        key: KEY,
        messages: [{ role: "user", text: "hi" }],
        fetchFn,
      }),
    ).rejects.toMatchObject({ code: "invalid-key" });
  });
});
