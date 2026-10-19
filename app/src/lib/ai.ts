// AI routing: Gemini first, OpenRouter as a fallback.
//
// Every call site in the app used to call geminiGenerate directly. This
// wrapper keeps that exact contract (same opts shape, same returned text,
// same GeminiError codes) but adds a second lane: if the Gemini call throws
// AND the user has pasted an OpenRouter key in Settings, the same prompt is
// replayed through OpenRouter. If there is no Gemini key at all but an
// OpenRouter key exists, OpenRouter is used directly. Only when both are
// unavailable do we surface the usual "no key" error.
import { GeminiError } from "./gemini";
import { getEffectiveApiKey } from "./apikey";
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

export async function aiGenerate(opts: AiOpts): Promise<string> {
  const geminiKey = opts.apiKey ?? getEffectiveApiKey();
  const orKey = hasOpenRouterKey() ? getOpenRouterKey() : "";

  if (geminiKey) {
    try {
      return await geminiGenerate({ ...opts, key: geminiKey });
    } catch (e) {
      // Gemini failed. If the user has an OpenRouter key, replay the exact
      // same prompt there instead of surfacing the Gemini error. If OpenRouter
      // also fails, the original Gemini error is what the caller sees — the
      // same message AskSheet showed before this fallback existed.
      if (orKey) {
        try {
          return await openRouterGenerate({
            ...opts,
            key: orKey,
          });
        } catch {
          throw e;
        }
      }
      throw e;
    }
  }

  if (orKey) {
    return openRouterGenerate({ ...opts, key: orKey });
  }

  throw new GeminiError(
    "no-key",
    "Add a Gemini key (or an OpenRouter key) in Settings to use the AI.",
  );
}