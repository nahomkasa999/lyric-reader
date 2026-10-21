// The streaming answer (v4.13).
//
// The same routing as lib/ai.ts — Gemini first, OpenRouter as the
// fallback — but the answer arrives in pieces instead of all at once
// at the end.
//
// The fallback only fires BEFORE the first token: once a word has been
// shown, a second provider would say something different, and the
// reader would see two answers spliced together.
import { GeminiError } from "./errors";
import { getApiKeys } from "./apikey";
import { geminiStream } from "./geminiStream";
import { openRouterStream } from "./openRouterStream";
import { getOpenRouterKey, hasOpenRouterKey } from "./openrouter";

export interface StreamOpts {
  apiKey?: string;
  system?: string;
  messages: Array<{ role: "user" | "model"; text: string }>;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken: (token: string) => void;
  fetchFn?: typeof fetch;
}

/**
 * Stream an answer.
 *
 * Returns the whole answer, and calls `onToken` for every piece of it
 * as it arrives.
 */
export async function aiStream(opts: StreamOpts): Promise<string> {
  // The reader's own key wins; the keys after it are the spares.
  const keys = opts.apiKey ? [opts.apiKey] : getApiKeys();
  const orKey = hasOpenRouterKey() ? getOpenRouterKey() : "";
  let spoken = false;
  let firstError: Error | null = null;
  const onToken = (token: string) => {
    spoken = true;
    opts.onToken(token);
  };

  for (const key of keys) {
    try {
      return await geminiStream(
        {
          key,
          system: opts.system,
          messages: opts.messages,
          maxTokens: opts.maxTokens,
          signal: opts.signal,
          fetchFn: opts.fetchFn,
        },
        onToken,
      );
    } catch (e) {
      if (!firstError) firstError = e instanceof Error ? e : new Error("The AI did not answer.");
      // A stopped answer is not a failure to work around, and a half
      // spoken answer must not be restarted somewhere else.
      if (opts.signal?.aborted) throw e;
      if (spoken) throw e;
      // Only a RATE LIMIT is worth trying with the spare key — a bad key
      // or a broken request fails the same way with the next one.
      if (!(e instanceof GeminiError) || e.code !== "quota") break;
    }
  }

  if (orKey) {
    try {
      return await openRouterStream(
        {
          key: orKey,
          system: opts.system,
          messages: opts.messages,
          maxTokens: opts.maxTokens,
          signal: opts.signal,
          fetchFn: opts.fetchFn,
        },
        onToken,
      );
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
