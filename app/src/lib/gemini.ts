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

export const GEMINI_MODEL = "gemini-2.5-flash";

interface GenOpts {
  key: string;
  system?: string;
  messages: GeminiMessage[];
  /** when true, request application/json and return raw text for parsing */
  json?: boolean;
  maxTokens?: number;
  fetchFn?: typeof fetch;
}

interface GenResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

export async function geminiGenerate(opts: GenOpts): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const contents = opts.messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: opts.maxTokens ?? 600,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] };
  }
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.key,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GeminiError(
      "network",
      "Couldn't reach Google's servers — check your connection and try again.",
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
    if (code === 400 || /key/i.test(msg))
      throw new GeminiError(
        "invalid-key",
        "That key didn't work — double-check it in Settings, or grab a fresh one from Google AI Studio.",
      );
    if (code === 429 || code === 503)
      throw new GeminiError(
        "quota",
        "The AI is rate-limited right now — wait a little and retry.",
      );
    throw new GeminiError(
      "unknown",
      `The AI call failed (${code}). Try again in a moment.`,
    );
  }
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(
      "blocked",
      "The AI declined that request. Try asking it differently.",
    );
  }
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";
  if (!text.trim()) {
    throw new GeminiError(
      "unknown",
      "The AI came back empty — try asking again.",
    );
  }
  return text;
}

/** One tiny call to verify a key. Never logs or persists the key. */
export async function testApiKey(
  key: string,
  fetchFn?: typeof fetch,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!key.trim()) return { ok: false, reason: "Paste a key first." };
  try {
    const text = await geminiGenerate({
      key: key.trim(),
      messages: [{ role: "user", text: "Reply with exactly this word: ok" }],
      maxTokens: 10,
      fetchFn,
    });
    return /\bok\b/i.test(text) ? { ok: true } : { ok: true };
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
