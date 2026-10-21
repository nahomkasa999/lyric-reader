// The SSE reader (v4.13) — one reader for both providers.
//
// Both Gemini's `:streamGenerateContent?alt=sse` and OpenRouter's
// `/chat/completions` speak the same wire format: frames separated by
// a blank line, each carrying a `data: ` line. So one reader serves
// both, and the providers only have to say what a frame means.
import { GeminiError } from "./errors";

/**
 * Read a stream of server-sent events.
 *
 * `onData` gets the payload of every frame, without the `data: `
 * prefix. `[DONE]` ends the stream. A frame that arrives in two pieces
 * is put back together first — the network is free to split anywhere.
 */
export async function readSse(
  res: Response,
  onData: (data: string) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) {
    throw new GeminiError("unknown", "The AI sent no stream.");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut = buffer.indexOf("\n\n");
    while (cut >= 0) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") return;
        onData(data);
      }
      cut = buffer.indexOf("\n\n");
    }
  }
}
