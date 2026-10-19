// Meaning lookup: free dictionary API for single words (exact, instant),
// Gemini for phrases / idioms / "as used in this sentence".
// fetch is injectable so tests run fully offline with stubs.
import { geminiGenerate, GeminiError } from "./gemini";

export interface DictDef {
  definition: string;
  example?: string;
}

export interface DictPos {
  partOfSpeech: string;
  defs: DictDef[];
}

export type MeaningStatus =
  | "ready"
  | "not-found"
  | "needs-key"
  | "offline"
  | "error";

export interface MeaningModel {
  /** display text as the user selected it */
  word: string;
  phonetic?: string;
  groups: DictPos[];
  /** AI line explaining the word/phrase in the given sentence */
  inContext?: string;
}

export interface MeaningOutcome {
  status: MeaningStatus;
  model?: MeaningModel;
  /** for "needs-key": the selected text */
  query?: string;
}

interface DictEntry {
  word?: string;
  phonetic?: string;
  phonetics?: Array<{ text?: string }>;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; example?: string }>;
  }>;
}

/** First entry -> our view model. Null when nothing usable parsed. */
export function parseDictionaryEntry(json: unknown): MeaningModel | null {
  if (!Array.isArray(json) || !json.length) return null;
  const e = json[0] as DictEntry;
  if (!e || !Array.isArray(e.meanings) || !e.meanings.length) return null;
  const phonetic =
    e.phonetic ??
    e.phonetics?.map((p) => p.text).find((t) => t && t.trim()) ??
    undefined;
  const groups: DictPos[] = [];
  for (const m of e.meanings) {
    const defs: DictDef[] = [];
    for (const d of m.definitions ?? []) {
      if (!d.definition?.trim()) continue;
      defs.push({
        definition: d.definition.trim(),
        example: d.example?.trim() || undefined,
      });
      if (defs.length >= 2) break;
    }
    if (defs.length) {
      groups.push({
        partOfSpeech: m.partOfSpeech?.trim() || "word",
        defs,
      });
    }
  }
  if (!groups.length) return null;
  return {
    word: e.word?.trim() || "",
    phonetic: phonetic?.trim() || undefined,
    groups,
  };
}

/**
 * Light lemmatizer: -ies -> y, -es/-ed/-ing strips with a doubled
 * consonant fix, -s -> singular. Returns a candidate or null.
 */
export function lemmatize(word: string): string | null {
  const w = word.toLowerCase();
  if (w.length < 4) return null;
  const dedupe = (s: string) =>
    s.length >= 4 && s[s.length - 1] === s[s.length - 2]
      ? s.slice(0, -1)
      : s;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("ed") && w.length > 4) return dedupe(w.slice(0, -2));
  if (w.endsWith("ing") && w.length > 5) return dedupe(w.slice(0, -3));
  if (w.endsWith("s") && w.length > 3) return w.slice(0, -1);
  return null;
}

const DICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";

interface LookupOpts {
  text: string;
  sentence: string;
  apiKey: string;
  fetchFn?: typeof fetch;
}

function cleanText(t: string): string {
  return t.replace(/^["'“”‘’\(\[]+|["'“”‘’\)\]\.,;:!?]+$/g, "").trim();
}

async function fetchWord(
  word: string,
  fetchFn: typeof fetch,
): Promise<MeaningModel | "not-found" | "offline"> {
  let res: Response;
  try {
    res = await fetchFn(DICT_URL + encodeURIComponent(word));
  } catch {
    return "offline";
  }
  if (res.status === 404) return "not-found";
  if (!res.ok) return "offline";
  try {
    const json = await res.json();
    const parsed = parseDictionaryEntry(json);
    return parsed ?? "not-found";
  } catch {
    return "offline";
  }
}

interface AiMeaning {
  definition: string;
  inContext?: string;
}

/** Ask Gemini for a phrase/idiom meaning as JSON. Null on any failure. */
export async function geminiMeaning(
  query: string,
  sentence: string,
  apiKey: string,
  fetchFn?: typeof fetch,
): Promise<AiMeaning | null> {
  try {
    const raw = await geminiGenerate({
      key: apiKey,
      json: true,
      maxTokens: 220,
      system:
        "You are a concise dictionary for a reader of English books. Reply with JSON only.",
      messages: [
        {
          role: "user",
          text:
            `Define this word or phrase for a learner: "${query}".\n` +
            `It appears in this sentence: "${sentence}".\n` +
            `Reply with JSON: {"definition": "...", "inContext": "what it means in that sentence"}. ` +
            `Keep the definition under 25 words and inContext under 20 words.`,
        },
      ],
      fetchFn,
    });
    const parsed = JSON.parse(raw) as {
      definition?: string;
      inContext?: string;
    };
    if (!parsed.definition?.trim()) return null;
    return {
      definition: parsed.definition.trim(),
      inContext: parsed.inContext?.trim() || undefined,
    };
  } catch (e) {
    if (e instanceof GeminiError && e.code === "network") return null;
    return null;
  }
}

/** A short "as used in this sentence" line for a plain word. */
export async function geminiInContext(
  word: string,
  sentence: string,
  apiKey: string,
  fetchFn?: typeof fetch,
): Promise<string | null> {
  try {
    const text = await geminiGenerate({
      key: apiKey,
      maxTokens: 60,
      system: "Reply with a single short sentence, no quotes or preamble.",
      messages: [
        {
          role: "user",
          text: `In one short sentence, explain what the word "${word}" means as used in this sentence: "${sentence}".`,
        },
      ],
      fetchFn,
    });
    return text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Full lookup: dictionary for single words (+ one lemmatizer retry on 404),
 * Gemini JSON for phrases. Returns the view model + how it was found.
 */
export async function lookupMeaning(opts: LookupOpts): Promise<MeaningOutcome> {
  const fetchFn = opts.fetchFn ?? fetch;
  const text = cleanText(opts.text);
  if (!text) return { status: "error" };

  if (/\s/.test(text)) {
    // Phrase: only Gemini can define it.
    if (!opts.apiKey) return { status: "needs-key", query: text };
    const ai = await geminiMeaning(text, opts.sentence, opts.apiKey, fetchFn);
    if (!ai) return { status: "error" };
    return {
      status: "ready",
      model: {
        word: text,
        groups: [{ partOfSpeech: "phrase", defs: [{ definition: ai.definition }] }],
        inContext: ai.inContext,
      },
    };
  }

  const lower = text.toLowerCase();
  let found = await fetchWord(lower, fetchFn);
  if (found === "not-found") {
    const lemma = lemmatize(lower);
    if (lemma && lemma !== lower) {
      const retry = await fetchWord(lemma, fetchFn);
      if (retry !== "not-found") found = retry;
    }
  }
  if (found === "not-found")
    return { status: "not-found", query: text };
  if (found === "offline") return { status: "offline" };
  if (found.word && !found.word.trim()) found.word = text;
  return { status: "ready", model: found };
}
