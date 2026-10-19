// Minimal Gemini client for the bring-your-own-key flow.
// The key is the user's own, stored on-device (lib/apikey.ts) and sent
// only to generativelanguage.googleapis.com. It is never logged.
import { getApiKey } from "./apikey";

export interface GeminiMessage {
  role: "user" | "model";
  text: string;
}

export type GeminiFailure =
  | "no-key"
  | "invalid-key"
  | "quota"
  | "network"
  | "blocked"
  | "unknown";

export class GeminiError extends Error {
  code: GeminiFailure;
  constructor(code: GeminiFailure, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * v4.2: Google's documented rolling alias for the newest Flash model.
 * Used as the hard fallback when discovery can't help (per the official
 * REST example Nahom sent): if every discovered name 404s — or discovery
 * itself fails — we call the alias once before surfacing an error.
 */
export const GEMINI_FLASH_ALIAS = "gemini-flash-latest";
/** Last-resort model if on-device discovery can't run yet. */
const GEMINI_MODEL_FALLBACK = GEMINI_FLASH_ALIAS;
const MODEL_STORAGE_KEY = "lr-gemini-model";
const MODELS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100";

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
function lsDel(k: string): void {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/**
 * v4.2: no Gemini call may hang indefinitely — his phone sits on a slow
 * network, and an unresolved promise means a stuck "Looking it up…" card.
 */
const GEMINI_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  ms: number = GEMINI_TIMEOUT_MS,
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

/**
 * Pick the best model name from a models.list payload, pure and unit-tested.
 * Preference: gemini-3.5-flash first, then the documented `gemini-flash-latest`
 * rolling alias, then 3-flash, 2.5-flash, 2-flash, then any other flash-class
 * model; within a tier, non-preview beats preview and non-lite beats lite.
 * `names` are already filtered to generateContent-capable.
 */
export function pickModel(names: string[]): string | null {
  const tierOf = (n: string): number => {
    const l = n.toLowerCase();
    if (/3\.5-flash/.test(l)) return 0;
    if (/flash-latest/.test(l)) return 1;
    if (/3-flash/.test(l)) return 2;
    if (/2\.5-flash/.test(l)) return 3;
    if (/2(-|\.)0-flash/.test(l)) return 4;
    if (/flash/.test(l)) return 5;
    return 6;
  };
  const penalty = (n: string): number => {
    const l = n.toLowerCase();
    return (l.includes("preview") ? 2 : 0) + (l.includes("lite") ? 1 : 0);
  };
  const sorted = [...names].sort(
    (a, b) => tierOf(a) - tierOf(b) || penalty(a) - penalty(b),
  );
  return sorted.length ? sorted[0] : null;
}

/**
 * Ask the API itself which models this key can use (v4.1: the hardcoded
 * model 404'd on real keys, and this VM can't reach Google, so discovery
 * MUST happen on the user's device). Saves the winner for later calls.
 */
export async function discoverModel(
  key: string,
  fetchFn?: typeof fetch,
): Promise<string | null> {
  const f = fetchFn ?? fetch;
  try {
    const res = await fetchTolerant(f, MODELS_URL, {
      headers: { "x-goog-api-key": key },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    const names = (data.models ?? [])
      .filter((m) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent"),
      )
      .map((m) => String(m.name ?? "").replace(/^models\//, ""));
    const pick = pickModel(names);
    if (pick) lsSet(MODEL_STORAGE_KEY, pick);
    return pick;
  } catch {
    return null;
  }
}

/** The model we currently believe works for this key. */
export function storedModel(): string | null {
  return lsGet(MODEL_STORAGE_KEY);
}

async function resolveModel(
  key: string,
  fetchFn?: typeof fetch,
): Promise<string> {
  return (
    storedModel() ??
    (await discoverModel(key, fetchFn)) ??
    GEMINI_MODEL_FALLBACK
  );
}

interface GenOpts {
  key: string;
  system?: string;
  messages: GeminiMessage[];
  /** when true, request application/json and return raw text for parsing */
  json?: boolean;
  maxTokens?: number;
  fetchFn?: typeof fetch;
  /** explicit model override (skips discovery) */
  model?: string;
  /** internal: already retried after a 404 once */
  _retried?: boolean;
}

interface GenResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

export async function geminiGenerate(opts: GenOpts): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  // Explicit model override: no discovery, no 404 retry.
  if (opts.model) return generateWithModel(opts.model, opts, fetchFn);
  const model = storedModel() ?? (await resolveModel(opts.key, fetchFn));
  return generateWithModel(model, opts, fetchFn);
}

async function generateWithModel(
  model: string,
  opts: GenOpts,
  fetchFn: typeof fetch,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const contents = opts.messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: opts.maxTokens ?? 1024,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] };
  }
  let res: Response;
  try {
    res = await fetchTolerant(fetchFn, url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.key,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new GeminiError(
      "network",
      isAbort(e)
        ? "The AI took too long to answer — check your connection and try again."
        : "Couldn't reach Google's servers — check your connection and try again.",
    );
  }
  let data: GenResponse;
  try {
    data = (await res.json()) as GenResponse;
  } catch {
    throw new GeminiError("unknown", "Got an unreadable reply from the AI.");
  }
  if (!res.ok) {
    const code = data.error?.code ?? res.status;
    const msg = data.error?.message ?? "";
    // v4.2: surface Google's own error text (truncated) next to our mapped
    // messages, so a failure can be diagnosed from a screenshot alone.
    const raw = String(msg).replace(/\s+/g, " ").trim().slice(0, 140);
    const suffix = raw ? ` (Google: ${raw})` : "";
    if (code === 400 || /key/i.test(msg))
      throw new GeminiError(
        "invalid-key",
        "That key didn't work — double-check it in Settings, or grab a fresh one from Google AI Studio." +
          suffix,
      );
    if (code === 429 || code === 503)
      throw new GeminiError(
        "quota",
        "The AI is rate-limited right now — wait a little and retry." + suffix,
      );
    if (code === 404 && !opts.model && !opts._retried) {
      // v4.1: the stored/hardcoded model name isn't valid for this key —
      // re-discover what the key can actually use, then retry once.
      // v4.2: if discovery dead-ends too (or just repeats the same name),
      // fall back to Google's documented `gemini-flash-latest` alias once
      // before surfacing an error.
      lsDel(MODEL_STORAGE_KEY);
      const fresh = await discoverModel(opts.key, fetchFn);
      if (fresh && fresh !== model) {
        return generateWithModel(
          fresh,
          { ...opts, _retried: true },
          fetchFn,
        );
      }
      if (model !== GEMINI_FLASH_ALIAS) {
        lsSet(MODEL_STORAGE_KEY, GEMINI_FLASH_ALIAS);
        return generateWithModel(
          GEMINI_FLASH_ALIAS,
          { ...opts, _retried: true },
          fetchFn,
        );
      }
    }
    throw new GeminiError(
      "unknown",
      `The AI call failed (${code}). Try again in a moment.` + suffix,
    );
  }
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(
      "blocked",
      "The AI declined that request. Try asking it differently.",
    );
  }
  // v4.4: thinking models burn tokens on internal reasoning before any visible
  // text, so a tiny maxOutputTokens can leave only thoughts — which must never
  // reach the caller. Skip parts flagged as thoughts when joining text.
  const text =
    data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("") ?? "";
  if (!text.trim()) {
    const finish = data.candidates?.[0]?.finishReason;
    const suffix = finish ? ` (finish: ${finish})` : "";
    throw new GeminiError(
      "unknown",
      `The AI came back empty${suffix} — try asking again.`,
    );
  }
  return text;
}

/**
 * Verify a key AND discover the model it should use. Never logs or persists
 * the key — only the chosen model name is stored.
 */
export async function testApiKey(
  key: string,
  fetchFn?: typeof fetch,
): Promise<{ ok: true; model: string } | { ok: false; reason: string }> {
  const k = key.trim();
  if (!k) return { ok: false, reason: "Paste a key first." };
  // Fresh discovery for a freshly-typed key (the old choice may be stale).
  lsDel(MODEL_STORAGE_KEY);
  const model = await discoverModel(k, fetchFn);
  if (!model)
    return {
      ok: false,
      reason:
        "That key didn't unlock any Gemini model — double-check it in Settings, or grab a fresh one from Google AI Studio.",
    };
  try {
    await geminiGenerate({
      key: k,
      model,
      messages: [{ role: "user", text: "Reply with exactly this word: ok" }],
      maxTokens: 512,
      fetchFn,
    });
    return { ok: true, model };
  } catch (e) {
    return {
      ok: false,
      reason:
        e instanceof GeminiError ? e.message : "Couldn't reach the AI.",
    };
  }
}

export function storedApiKey(): string {
  return getApiKey();
}
