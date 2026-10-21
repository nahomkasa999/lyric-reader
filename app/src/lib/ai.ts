// AI routing: Gemini first, OpenRouter as a fallback.
//
// Every call site in the app used to call geminiGenerate directly. This
// wrapper keeps that exact contract (same opts shape, same returned text,
// same GeminiError codes) but adds two lanes:
//
//   1. the reader's OWN keys, in order — the second one is tried when
//      the first is RATE LIMITED (a limit says the project is busy, not
//      that the key is wrong);
//   2. OpenRouter, if the reader pasted a key for it.
//
// Only when everything is unavailable do we surface the usual "no key"
// error.
import { GeminiError } from "./errors";
import { getApiKeys } from "./apikey";
import { geminiGenerate } from "./gemini";
import {
  getOpenRouterKey,
  hasOpenRouterKey,
  openRouterGenerate,
} from "./openrouter";

// Re-exported so call sites can import GeminiError from the routing wrapper
// alongside aiGenerate, keeping one import line per file.
export { GeminiError };

export interface AiOpts {
  apiKey?: string;
  system?: string;
  messages: Array<{ role: "user" | "model"; text: string }>;
  json?: boolean;
  maxTokens?: number;
  fetchFn?: typeof fetch;
  model?: string;
}

/** Is this failure worth trying somewhere else? */
function isThrottle(e: Error): boolean {
  return e instanceof GeminiError && e.code === "quota";
}

export async function aiGenerate(opts: AiOpts): Promise<string> {
  // The reader's own key wins; the keys after it are the spares.
  const keys = opts.apiKey ? [opts.apiKey] : getApiKeys();
  const orKey = hasOpenRouterKey() ? getOpenRouterKey() : "";
  let firstError: Error | null = null;

  for (const key of keys) {
    try {
      return await geminiGenerate({ ...opts, key });
    } catch (e) {
      if (!firstError)
        firstError = e instanceof Error ? e : new Error("The AI did not answer.");
      // A bad key or a broken request fails the same way with the next
      // key — only a RATE LIMIT is worth trying with the spare.
      if (!isThrottle(e instanceof Error ? e : new Error(""))) break;
    }
  }

  if (orKey) {
    try {
      return await openRouterGenerate({ ...opts, key: orKey });
    } catch {
      throw firstError ?? new GeminiError("unknown", "The AI did not answer.");
    }
  }

  throw (
    firstError ??
    new GeminiError(
      "no-key",
      "Add a Gemini key (or an OpenRouter key) in Settings to use the AI.",
    )
  );
}
