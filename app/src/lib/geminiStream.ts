// The Gemini stream (v4.13): the answer, token by token.
//
// The request is the same one `generateWithModel` sends — the same
// body, the same headers — with `alt=sse` added, so the answer arrives
// in pieces instead of all at once at the end.
//
// It lives in its own file so the Gemini client stays a client and the
// two do not grow into each other.
import { GeminiError } from "./errors";
import {
  fetchTolerant,
  geminiFailure,
  GEMINI_FLASH_ALIAS,
  storedModel,
  type GeminiMessage,
} from "./gemini";
import { readSse } from "./sse";

interface StreamFrame {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export interface GeminiStreamOpts {
  key: string;
  system?: string;
  messages: GeminiMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  model?: string;
}

/** Stream an answer from Gemini. */
export async function geminiStream(
  opts: GeminiStreamOpts,
  onToken: (token: string) => void,
): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const model = opts.model ?? storedModel() ?? GEMINI_FLASH_ALIAS;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  const contents = opts.messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: opts.maxTokens ?? 1024,
    },
  };
  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] };
  }

  let res: Response;
  try {
    res = await fetchTolerant(
      fetchFn,
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": opts.key,
        },
        body: JSON.stringify(body),
      },
      opts.signal,
    );
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new GeminiError(
      "network",
      "Couldn't reach Google's servers — check your connection and try again.",
    );
  }

  if (!res.ok) {
    let data: { error?: { code?: number; message?: string } } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* the body was not JSON — the status is all we have */
    }
    throw geminiFailure(
      data.error?.code ?? res.status,
      data.error?.message ?? "",
    );
  }

  let out = "";
  let finish = "";
  await readSse(res, (payload) => {
    let frame: StreamFrame;
    try {
      frame = JSON.parse(payload) as StreamFrame;
    } catch {
      return;
    }
    if (frame.promptFeedback?.blockReason) {
      throw new GeminiError(
        "blocked",
        "The AI declined that request. Try asking it differently.",
      );
    }
    finish = frame.candidates?.[0]?.finishReason ?? finish;
    const parts = frame.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      // A thinking model's thoughts are not for the reader.
      if (part.thought) continue;
      const text = part.text ?? "";
      if (!text) continue;
      out += text;
      onToken(text);
    }
  });
  // A thinking model can spend its whole budget on thoughts, or be cut
  // off by a safety filter, and then nothing visible arrives. That must
  // be said — an empty reply shown as an answer looks like a dead AI.
  if (!out.trim()) {
    const suffix = finish ? ` (finish: ${finish})` : "";
    throw new GeminiError(
      "unknown",
      `The AI came back empty${suffix} — try asking again.`,
    );
  }
  return out;
}
