// Amharic meanings, the translation, and the search that remembers the chat.
import { describe, it, expect, vi } from "vitest";
import { isAmharic, lookupMeaning, translateText } from "../src/lib/meaning";
import { searchQueryFor } from "../src/lib/answerQuestion";
import type { AssistantMessage } from "../src/lib/assistantStore";

vi.mock("../src/lib/ai", () => ({
  aiGenerate: vi.fn(async (o: { json?: boolean; system?: string }) =>
    o.json
      ? JSON.stringify({
          partOfSpeech: "ስም",
          definition: "የቃሉ ትርጉም",
          example: "ምሳሌ",
          inContext: "በዚህ ዐረፍተ ነገር",
        })
      : /into English/.test(o.system ?? "")
        ? "Hello"
        : "ሰላም",
  ),
  GeminiError: class extends Error {},
}));

const msg = (role: "user" | "ai", text: string): AssistantMessage => ({ role, text, at: 0 });

describe("Amharic", () => {
  it("knows the script", () => {
    expect(isAmharic("ሰላም")).toBe(true);
    expect(isAmharic("hello")).toBe(false);
  });

  it("defines an Amharic word in Amharic, without the English dictionary", async () => {
    const fetchFn = vi.fn();
    const out = await lookupMeaning({ text: "ሰላም።", sentence: "ሰላም ነው።", apiKey: "k", fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(out.status).toBe("ready");
    expect(out.model?.lang).toBe("am");
    expect(out.model?.groups[0].defs[0].definition).toBe("የቃሉ ትርጉም");
  });

  it("asks for a key when there is none", async () => {
    const out = await lookupMeaning({ text: "ሰላም", sentence: "", apiKey: "" });
    expect(out.status).toBe("needs-key");
  });
});

describe("the translation", () => {
  it("translates English into Amharic", async () => {
    expect(await translateText("Hello", "k")).toEqual({ text: "ሰላም", target: "Amharic" });
  });

  it("translates Amharic back into English", async () => {
    expect(await translateText("ሰላም", "k")).toEqual({ text: "Hello", target: "English" });
  });
});

describe("the search remembers the chat", () => {
  it("a short follow-up borrows the earlier questions", () => {
    const h = [msg("user", "Who built the tower?"), msg("ai", "The king did.")];
    expect(searchQueryFor("and why?", h)).toBe("Who built the tower? and why?");
  });

  it("a full question stands alone", () => {
    const h = [msg("user", "Who built the tower?")];
    const q = "What does the author say about the weather in the third chapter of the book";
    expect(searchQueryFor(q, h)).toBe(q);
  });

  it("with no history the question is unchanged", () => {
    expect(searchQueryFor("and why?", [])).toBe("and why?");
  });
});
