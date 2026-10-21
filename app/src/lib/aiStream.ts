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
import { getEffectiveApiKey } from "./apikey";
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
  const geminiKey = opts.apiKey ?? getEffectiveApiKey();
  const orKey = hasOpenRouterKey() ? getOpenRouterKey() : "";
  let spoken = false;
  const onToken = (token: string) => {
    spoken = true;
    opts.onToken(token);
  };

  if (geminiKey) {
    try {
      return await geminiStream(
        {
          key: geminiKey,
          system: opts.system,
          messages: opts.messages,
          maxTokens: opts.maxTokens,
          signal: opts.signal,
          fetchFn: opts.fetchFn,
        },
        onToken,
      );
    } catch (e) {
      // A stopped answer is not a failure to work around, and a half
      // spoken answer must not be restarted somewhere else.
      if (opts.signal?.aborted) throw e;
      if (spoken || !orKey) throw e;
      return openRouterStream(
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
    }
  }

  if (orKey) {
    return openRouterStream(
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
  }

  throw new GeminiError(
    "no-key",
    "Add a Gemini key (or an OpenRouter key) in Settings to use the AI.",
  );
}
