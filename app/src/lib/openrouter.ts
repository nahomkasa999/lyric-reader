// OpenRouter (openrouter.ai) as a FALLBACK AI provider — used only when the
// user's own Gemini call fails, and only if he has pasted his own OpenRouter
// key in Settings. The key is stored on this phone only (localStorage,
// "lr-openrouter-key"), never logged, and sent only to openrouter.ai.
//
// The API is OpenAI-compatible, so the request/response shape mirrors the
// Gemini client — but the wire format is OpenAI's chat completions.
import { GeminiError } from "./gemini";

/** The default OpenRouter model: the free, auto-routing "any free model" tier. */
export const OPENROUTER_MODEL = "openrouter/free";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = 20_000;
const KEY = "lr-openrouter-key";

export function getOpenRouterKey(): string {
  try {
    return (localStorage.getItem(KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function setOpenRouterKey(k: string): void {
  try {
    localStorage.setItem(KEY, k.trim());
  } catch {
    /* private mode: the key just won't persist */
  }
}

export function removeOpenRouterKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasOpenRouterKey(): boolean {
  return getOpenRouterKey().length > 0;
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  ms: number = OPENROUTER_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetchFn(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Fetch with one automatic retry on network failure / timeout. */
async function fetchTolerant(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchWithTimeout(fetchFn, url, init);
  } catch {
    return await fetchWithTimeout(fetchFn, url, init);
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

interface OrMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OrOpts {
  key: string;
  system?: string;
  messages: Array<{ role: "user" | "model"; text: string }>;
  json?: boolean;
  maxTokens?: number;
  fetchFn?: typeof fetch;
  model?: string;
}

interface OrResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { code?: number; message?: string };
}

/**
 * One OpenAI-compatible chat completion. Mirrors geminiGenerate's contract:
 * returns the visible text, or throws a GeminiError (same code set) so the
 * routing wrapper can treat both providers uniformly.
 */
export async function openRouterGenerate(opts: OrOpts): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const model = opts.model ?? OPENROUTER_MODEL;
  const messages: OrMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  for (const m of opts.messages) {
    messages.push({
      role: m.role === "model" ? "assistant" : "user",
      content: m.text,
    });
  }
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetchTolerant(fetchFn, OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.key}`,
        "X-Title": "Lyric Reader",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new GeminiError(
      "network",
      isAbort(e)
        ? "The AI took too long to answer — check your connection and try again."
        : "Couldn't reach OpenRouter's servers — check your connection and try again.",
    );
  }

  let data: OrResponse;
  try {
    data = (await res.json()) as OrResponse;
  } catch {
    throw new GeminiError("unknown", "Got an unreadable reply from the AI.");
  }

  if (!res.ok) {
    const code = data.error?.code ?? res.status;
    const msg = data.error?.message ?? "";
    const raw = String(msg).replace(/\s+/g, " ").trim().slice(0, 140);
    const suffix = raw ? ` (OpenRouter: ${raw})` : "";
    if (code === 400 || /key/i.test(msg) || /auth/i.test(msg))
      throw new GeminiError(
        "invalid-key",
        "That OpenRouter key didn't work — double-check it in Settings, or grab a fresh one at openrouter.ai." +
          suffix,
      );
    if (code === 429 || code === 503)
      throw new GeminiError(
        "quota",
        "OpenRouter is rate-limited right now — wait a little and retry." + suffix,
      );
    throw new GeminiError(
      "unknown",
      `The OpenRouter call failed (${code}). Try again in a moment.` + suffix,
    );
  }

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) {
    const finish = data.choices?.[0]?.finish_reason;
    const suffix = finish ? ` (finish: ${finish})` : "";
    throw new GeminiError(
      "unknown",
      `The AI came back empty${suffix} — try asking again.`,
    );
  }
  return text;
}

/**
 * Verify an OpenRouter key AND the default model it should use. Mirrors
 * testApiKey's shape and messages. Never logs or persists the key — only the
 * chosen model name is returned.
 */
export async function testOpenRouterKey(
  key: string,
  fetchFn?: typeof fetch,
): Promise<{ ok: true; model: string } | { ok: false; reason: string }> {
  const k = key.trim();
  if (!k) return { ok: false, reason: "Paste a key first." };
  try {
    await openRouterGenerate({
      key: k,
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", text: "Reply with exactly this word: ok" }],
      maxTokens: 512,
      fetchFn,
    });
    return { ok: true, model: OPENROUTER_MODEL };
  } catch (e) {
    return {
      ok: false,
      reason:
        e instanceof GeminiError ? e.message : "Couldn't reach OpenRouter.",
    };
  }
}