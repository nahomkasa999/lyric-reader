// The streamed answer (v4.13): an answer with no visible text is a
// failure the reader hears about — never a blank bubble with citations.
// And a vector is never saved under the wrong passage.
import { describe, it, expect } from "vitest";
import { geminiStream } from "../src/lib/geminiStream";
import { appendVectors } from "../src/lib/vectorStore";

/** A fetch that answers with the given server-sent-event frames. */
function sseFetch(frames: object[]): typeof fetch {
  return (async () => {
    const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("");
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as unknown as typeof fetch;
}

describe("the streamed answer", () => {
  it("returns the visible text, token by token", async () => {
    const tokens: string[] = [];
    const out = await geminiStream(
      {
        key: "k",
        messages: [{ role: "user", text: "why?" }],
        fetchFn: sseFetch([
          { candidates: [{ content: { parts: [{ text: "Because " }] } }] },
          { candidates: [{ content: { parts: [{ text: "of the war." }] }, finishReason: "STOP" }] },
        ]),
      },
      (t) => tokens.push(t),
    );
    expect(out).toBe("Because of the war.");
    expect(tokens).toEqual(["Because ", "of the war."]);
  });

  it("fails clearly when only thoughts arrive, instead of an empty answer", async () => {
    await expect(
      geminiStream(
        {
          key: "k",
          messages: [{ role: "user", text: "why?" }],
          fetchFn: sseFetch([
            { candidates: [{ content: { parts: [{ text: "thinking…", thought: true }] } }] },
            { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] },
          ]),
        },
        () => {},
      ),
    ).rejects.toThrow(/came back empty \(finish: MAX_TOKENS\)/);
  });

  it("fails clearly when the stream holds no text at all", async () => {
    await expect(
      geminiStream(
        {
          key: "k",
          messages: [{ role: "user", text: "why?" }],
          fetchFn: sseFetch([{ candidates: [{ finishReason: "SAFETY" }] }]),
        },
        () => {},
      ),
    ).rejects.toThrow(/came back empty/);
  });
});

describe("the stored vectors", () => {
  it("refuses to save vectors that do not match the passage ids one by one", async () => {
    const v = new Float32Array([1, 0]);
    await expect(appendVectors(["book:0", "book:1"], [v])).rejects.toThrow(
      /exactly one vector/,
    );
  });
});
