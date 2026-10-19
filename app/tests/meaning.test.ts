import { describe, expect, it, vi } from "vitest";
import {
  lemmatize,
  lookupMeaning,
  parseFreeDictionaryEntry,
  parseWiktionaryEntry,
  stripHtml,
} from "../src/lib/meaning";

// v4.3: free dictionary shape (freedictionaryapi.com — a clean Wiktionary).
const FREE_LANTERN = {
  word: "lantern",
  entries: [
    {
      language: { code: "en", name: "English" },
      partOfSpeech: "noun",
      pronunciations: [
        { type: "ipa", text: "/ˈlæntərn/", tags: [] },
      ],
      senses: [
        {
          definition:
            "A case of transparent material made to protect a flame.",
          examples: ["He carried a lantern into the dark."],
        },
        { definition: "The light chamber of a lighthouse." },
        { definition: "A third definition that should be dropped." },
      ],
    },
    {
      language: { code: "en", name: "English" },
      partOfSpeech: "verb",
      senses: [{ definition: "To furnish with a lantern." }],
    },
  ],
};

// v4.3: direct Wiktionary REST fallback shape (definitions contain HTML).
const WIKT_LANTERN = {
  en: [
    {
      partOfSpeech: "Noun",
      language: "English",
      definitions: [
        {
          definition:
            'A <a href="/wiki/device">device</a> that gives light.',
          examples: ["She lit a <b>lantern</b>."],
        },
        { definition: "The light chamber of a lighthouse." },
      ],
    },
  ],
};

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

describe("parseFreeDictionaryEntry", () => {
  it("parses word, IPA, parts of speech, first 2 senses each", () => {
    const m = parseFreeDictionaryEntry(FREE_LANTERN);
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

  it("ignores non-English entries", () => {
    const m = parseFreeDictionaryEntry({
      word: "lamp",
      entries: [
        {
          language: { code: "de" },
          partOfSpeech: "noun",
          senses: [{ definition: "Lampe" }],
        },
      ],
    });
    expect(m).toBeNull();
  });

  it("returns null for empty or unusable payloads", () => {
    expect(parseFreeDictionaryEntry({})).toBeNull();
    expect(parseFreeDictionaryEntry({ entries: [] })).toBeNull();
    expect(
      parseFreeDictionaryEntry({
        word: "x",
        entries: [{ language: { code: "en" }, senses: [] }],
      }),
    ).toBeNull();
  });
});

describe("parseWiktionaryEntry / stripHtml", () => {
  it("strips tags and decodes entities", () => {
    expect(stripHtml('A <a href="#">device</a> &amp; "light"')).toBe(
      'A device & "light"',
    );
  });

  it("parses definitions and lowercases the part of speech", () => {
    const m = parseWiktionaryEntry(WIKT_LANTERN, "lantern");
    expect(m).not.toBeNull();
    expect(m!.word).toBe("lantern");
    expect(m!.groups[0].partOfSpeech).toBe("noun");
    expect(m!.groups[0].defs[0].definition).toBe("A device that gives light.");
    expect(m!.groups[0].defs[0].example).toBe("She lit a lantern.");
  });

  it("returns null when there is no English section", () => {
    expect(parseWiktionaryEntry({})).toBeNull();
    expect(parseWiktionaryEntry({ fr: [] })).toBeNull();
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
    const f = stubFetch(() => FREE_LANTERN);
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
      return url.endsWith("/lantern")
        ? FREE_LANTERN
        : { word: "lanterns", entries: [] };
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
    const f = stubFetch(() => ({ word: "x", entries: [] }));
    const out = await lookupMeaning({
      text: "xylophonesque",
      sentence: "s",
      apiKey: "",
      fetchFn: f as unknown as typeof fetch,
    });
    expect(out.status).toBe("not-found");
  });

  it("falls back to Wiktionary when the free dictionary is unreachable", async () => {
    const f = stubFetch((url: string) =>
      url.includes("freedictionaryapi")
        ? "network-error"
        : WIKT_LANTERN,
    );
    const out = await lookupMeaning({
      text: "lantern",
      sentence: "s",
      apiKey: "",
      fetchFn: f as unknown as typeof fetch,
    });
    expect(out.status).toBe("ready");
    expect(out.model!.groups[0].defs[0].definition).toBe(
      "A device that gives light.",
    );
  });

  it("reports offline when every dictionary host fails", async () => {
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
      fetchFn: geminiFetch,
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

  const isDict = (url: string) =>
    url.includes("freedictionaryapi") || url.includes("wiktionary");

  it("a dead dictionary + key yields an AI definition in the same card shape", async () => {
    const f = aiFetch();
    const out = await lookupMeaning({
      text: "lamp",
      sentence: "He lit the brass lamp.",
      apiKey: "KEY",
      fetchFn: ((url: string) =>
        isDict(url)
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

  it("a dictionary miss after the lemmatizer retry also falls back with a key", async () => {
    const f = aiFetch();
    const out = await lookupMeaning({
      text: "xylophonesque",
      sentence: "s",
      apiKey: "KEY",
      fetchFn: ((url: string) =>
        isDict(url)
          ? Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ word: "x", entries: [] }),
            })
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
