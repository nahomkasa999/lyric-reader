import { describe, expect, it, vi } from "vitest";
import {
  lemmatize,
  lookupMeaning,
  parseDictionaryEntry,
} from "../src/lib/meaning";

const DICT_LANTERN = [
  {
    word: "lantern",
    phonetic: "/ˈlæntərn/",
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          {
            definition: "A case of transparent material made to protect a flame.",
            example: "He carried a lantern into the dark.",
          },
          { definition: "The light chamber of a lighthouse." },
          { definition: "A third definition that should be dropped." },
        ],
      },
      {
        partOfSpeech: "verb",
        definitions: [{ definition: "To furnish with a lantern." }],
      },
    ],
  },
];

function stubFetch(handler: (url: string) => unknown) {
  return vi.fn(async (url: string) => {
    const r = handler(url);
    if (r === "network-error") throw new TypeError("offline");
    if (r === 404)
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    return {
      ok: true,
      status: 200,
      json: async () => r,
    } as Response;
  });
}

describe("parseDictionaryEntry", () => {
  it("parses word, phonetic, parts of speech, first 2 definitions each", () => {
    const m = parseDictionaryEntry(DICT_LANTERN);
    expect(m).not.toBeNull();
    expect(m!.word).toBe("lantern");
    expect(m!.phonetic).toBe("/ˈlæntərn/");
    expect(m!.groups).toHaveLength(2);
    expect(m!.groups[0].partOfSpeech).toBe("noun");
    expect(m!.groups[0].defs).toHaveLength(2);
    expect(m!.groups[0].defs[0].example).toBe(
      "He carried a lantern into the dark.",
    );
  });

  it("falls back to phonetics[].text when phonetic is missing", () => {
    const m = parseDictionaryEntry([
      {
        word: "lantern",
        phonetics: [{}, { text: "/x/" }],
        meanings: [{ partOfSpeech: "n", definitions: [{ definition: "d" }] }],
      },
    ]);
    expect(m!.phonetic).toBe("/x/");
  });

  it("returns null for empty or unusable payloads", () => {
    expect(parseDictionaryEntry([])).toBeNull();
    expect(parseDictionaryEntry({})).toBeNull();
    expect(
      parseDictionaryEntry([{ word: "x", meanings: [] }]),
    ).toBeNull();
    expect(
      parseDictionaryEntry([
        { word: "x", meanings: [{ partOfSpeech: "n", definitions: [] }] },
      ]),
    ).toBeNull();
  });
});

describe("lemmatize", () => {
  it("handles the common inflections", () => {
    expect(lemmatize("stories")).toBe("story");
    expect(lemmatize("watches")).toBe("watch");
    expect(lemmatize("stopped")).toBe("stop");
    expect(lemmatize("running")).toBe("run");
    expect(lemmatize("cats")).toBe("cat");
  });
  it("refuses short words and words with nothing to strip", () => {
    expect(lemmatize("cat")).toBeNull();
    expect(lemmatize("the")).toBeNull();
    expect(lemmatize("lantern")).toBeNull();
  });
});

describe("lookupMeaning", () => {
  it("finds a single word in the dictionary", async () => {
    const f = stubFetch(() => DICT_LANTERN);
    const out = await lookupMeaning({
      text: "lantern",
      sentence: "He lit the lantern.",
      apiKey: "",
      fetchFn: f as unknown as typeof fetch,
    });
    expect(out.status).toBe("ready");
    expect(out.model!.word).toBe("lantern");
    expect(f).toHaveBeenCalledOnce();
    expect(f.mock.calls[0][0]).toContain("/lantern");
  });

  it("retries once with the lemmatized form on 404", async () => {
    const seen: string[] = [];
    const f = stubFetch((url: string) => {
      seen.push(url);
      return url.endsWith("/lantern") ? DICT_LANTERN : 404;
    });
    const out = await lookupMeaning({
      text: "lanterns",
      sentence: "He lit the lanterns.",
      apiKey: "",
      fetchFn: f as unknown as typeof fetch,
    });
    expect(out.status).toBe("ready");
    expect(out.model!.word).toBe("lantern");
    expect(seen.some((u) => u.endsWith("/lanterns"))).toBe(true);
    expect(seen.some((u) => u.endsWith("/lantern"))).toBe(true);
  });

  it("reports not-found when both forms miss", async () => {
    const f = stubFetch(() => 404);
    const out = await lookupMeaning({
      text: "xylophonesque",
      sentence: "s",
      apiKey: "",
      fetchFn: f as unknown as typeof fetch,
    });
    expect(out.status).toBe("not-found");
  });

  it("reports offline on network failure", async () => {
    const f = stubFetch(() => "network-error");
    const out = await lookupMeaning({
      text: "lantern",
      sentence: "s",
      apiKey: "",
      fetchFn: f as unknown as typeof fetch,
    });
    expect(out.status).toBe("offline");
  });

  it("a phrase needs the key", async () => {
    const f = stubFetch(() => {
      throw new Error("should not be called");
    });
    const out = await lookupMeaning({
      text: "raining cats",
      sentence: "It was raining cats and dogs.",
      apiKey: "",
      fetchFn: f as unknown as typeof fetch,
    });
    expect(out.status).toBe("needs-key");
    expect(out.query).toBe("raining cats");
  });

  it("a phrase with a key comes from Gemini JSON", async () => {
    const f = stubFetch(() => "network-error"); // dictionary must not be hit
    const geminiFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    definition: "Raining very heavily.",
                    inContext: "Here it just means a downpour.",
                  }),
                },
              ],
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const out = await lookupMeaning({
      text: "raining cats and dogs",
      sentence: "It was raining cats and dogs.",
      apiKey: "KEY",
      fetchFn: ((url: string) =>
        url.includes("dictionaryapi.dev")
          ? f(url)
          : geminiFetch(url)) as typeof fetch,
    });
    expect(out.status).toBe("ready");
    expect(out.model!.groups[0].partOfSpeech).toBe("phrase");
    expect(out.model!.groups[0].defs[0].definition).toBe(
      "Raining very heavily.",
    );
    expect(out.model!.inContext).toBe("Here it just means a downpour.");
  });

  it("a malformed Gemini reply surfaces an error", async () => {
    const geminiFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "not json" }] } }],
      }),
    })) as unknown as typeof fetch;
    const out = await lookupMeaning({
      text: "raining cats",
      sentence: "s",
      apiKey: "KEY",
      fetchFn: geminiFetch,
    });
    expect(out.status).toBe("error");
  });
});

describe("v4.1 — dictionary failure falls back to Gemini", () => {
  const AI_JSON = JSON.stringify({
    phonetic: "/ˈlæmp/",
    partOfSpeech: "noun",
    definition: "A device that gives light, often powered by electricity.",
    example: "She switched on the lamp.",
    inContext: "Here it is the brass one on the landing.",
  });

  function aiFetch() {
    return vi.fn(async (url: string) => {
      if (url.includes("/models?"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            models: [
              {
                name: "models/gemini-3.5-flash",
                supportedGenerationMethods: ["generateContent"],
              },
            ],
          }),
        } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: AI_JSON }] } }],
        }),
      } as Response;
    }) as unknown as typeof fetch;
  }

  it("a dead dictionary + key yields an AI definition in the same card shape", async () => {
    const f = aiFetch();
    const out = await lookupMeaning({
      text: "lamp",
      sentence: "He lit the brass lamp.",
      apiKey: "KEY",
      fetchFn: ((url: string) =>
        url.includes("dictionaryapi.dev")
          ? Promise.reject(new TypeError("offline"))
          : f(url)) as typeof fetch,
    });
    expect(out.status).toBe("ready");
    expect(out.model!.word).toBe("lamp");
    expect(out.model!.phonetic).toBe("/ˈlæmp/");
    expect(out.model!.groups[0].defs[0].definition).toContain(
      "gives light",
    );
    expect(out.model!.inContext).toContain("brass one");
  });

  it("a dictionary 404 after the lemmatizer retry also falls back with a key", async () => {
    const f = aiFetch();
    const out = await lookupMeaning({
      text: "xylophonesque",
      sentence: "s",
      apiKey: "KEY",
      fetchFn: ((url: string) =>
        url.includes("dictionaryapi.dev")
          ? Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
          : f(url)) as unknown as typeof fetch,
    });
    expect(out.status).toBe("ready");
    expect(out.model!.groups[0].defs[0].definition).toContain("gives light");
  });

  it("a dead dictionary with no key stays offline", async () => {
    const out = await lookupMeaning({
      text: "lamp",
      sentence: "s",
      apiKey: "",
      fetchFn: (async () => {
        throw new TypeError("offline");
      }) as typeof fetch,
    });
    expect(out.status).toBe("offline");
  });
});
