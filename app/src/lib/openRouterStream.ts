// The OpenRouter stream (v4.13): the answer, token by token.
//
// The chat completions shape is OpenAI's, so the answer arrives in
// `choices[0].delta.content` pieces. The request is the same one
// `openRouterGenerate` sends, with `stream: true` added.
import { GeminiError } from "./errors";
import {
  fetchTolerant,
  openRouterFailure,
  OPENROUTER_MODEL,
  OPENROUTER_URL,
} from "./openrouter";
import { readSse } from "./sse";

export interface OrStreamOpts {
  key: string;
  system?: string;
  messages: Array<{ role: "user" | "model"; text: string }>;
  maxTokens?: number;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  model?: string;
}

/** One frame of an OpenAI-compatible stream. */
interface OrFrame {
  choices?: Array<{ delta?: { content?: string } }>;
}

interface OrMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Stream an answer from OpenRouter. */
export async function openRouterStream(
  opts: OrStreamOpts,
  onToken: (token: string) => void,
): Promise<string> {
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
    stream: true,
  };

  let res: Response;
  try {
    res = await fetchTolerant(
      fetchFn,
      OPENROUTER_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.key}`,
          "X-Title": "Lyric Reader",
        },
        body: JSON.stringify(body),
      },
      opts.signal,
    );
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new GeminiError(
      "network",
      "Couldn't reach OpenRouter's servers — check your connection and try again.",
    );
  }

  if (!res.ok) {
    let data: { error?: { code?: number; message?: string } } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* the body was not JSON — the status is all we have */
    }
    throw openRouterFailure(
      data.error?.code ?? res.status,
      data.error?.message ?? "",
    );
  }

  let out = "";
  await readSse(res, (payload) => {
    let frame: OrFrame;
    try {
      frame = JSON.parse(payload) as OrFrame;
    } catch {
      return;
    }
    const text = frame.choices?.[0]?.delta?.content ?? "";
    if (!text) return;
    out += text;
    onToken(text);
  });
  return out;
}
