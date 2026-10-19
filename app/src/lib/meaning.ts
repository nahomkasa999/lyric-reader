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
  timeoutMs = 6000,
): Promise<MeaningModel | "not-found" | "offline"> {
  // v4.1: a 6s timeout so a hanging dictionary can't stall the lookup
  // forever (his connection timed out on it in Ethiopia).
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(DICT_URL + encodeURIComponent(word), {
      signal: ctl.signal,
    });
    if (res.status === 404) return "not-found";
    if (!res.ok) return "offline";
    try {
      const json = await res.json();
      const parsed = parseDictionaryEntry(json);
      return parsed ?? "not-found";
    } catch {
      return "offline";
    }
  } catch {
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

interface AiMeaning {
  definition: string;
  inContext?: string;
}

/**
 * v4.1: full meaning from Gemini as a last resort — when the dictionary is
 * unreachable, times out, or 404s (even after the lemmatizer retry). Returns
 * a MeaningModel shaped exactly like a dictionary one, so the card renders
 * identically.
 */
export async function geminiFullMeaning(
  query: string,
  sentence: string,
  apiKey: string,
  fetchFn?: typeof fetch,
): Promise<MeaningModel | null> {
  try {
    const raw = await geminiGenerate({
      key: apiKey,
      json: true,
      maxTokens: 320,
      system:
        "You are a concise dictionary for a reader of English books. Reply with JSON only.",
      messages: [
        {
          role: "user",
          text:
            `Define this word or phrase for a learner: "${query}".\n` +
            `It appears in this sentence: "${sentence}".\n` +
            `Reply with JSON: {"phonetic": "pronunciation if known", ` +
            `"partOfSpeech": "noun", "definition": "...", ` +
            `"example": "...", "inContext": "what it means in that sentence"}. ` +
            `Keep the definition under 25 words and inContext under 20 words.`,
        },
      ],
      fetchFn,
    });
    const p = JSON.parse(raw) as {
      phonetic?: string;
      partOfSpeech?: string;
      definition?: string;
      example?: string;
      inContext?: string;
    };
    if (!p.definition?.trim()) return null;
    return {
      word: query,
      phonetic: p.phonetic?.trim() || undefined,
      groups: [
        {
          partOfSpeech: p.partOfSpeech?.trim() || "word",
          defs: [
            {
              definition: p.definition.trim(),
              example: p.example?.trim() || undefined,
            },
          ],
        },
      ],
      inContext: p.inContext?.trim() || undefined,
    };
  } catch {
    return null;
  }
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
  // v4.3: an effective key means Gemini is waiting as fallback, so give the
  // dictionary less time on slow networks (3.5s vs 6s) — meanings arrive
  // sooner instead of hanging on the dead lookup first.
  const dictTimeout = opts.apiKey ? 3500 : 6000;
  let found = await fetchWord(lower, fetchFn, dictTimeout);
  if (found === "not-found") {
    const lemma = lemmatize(lower);
    if (lemma && lemma !== lower) {
      const retry = await fetchWord(lemma, fetchFn, dictTimeout);
      if (retry !== "not-found") found = retry;
    }
  }
  // v4.1: ANY dictionary failure (404 even after the lemmatizer retry,
  // network error, timeout, CORS) falls back to Gemini when a key exists —
  // the word still gets defined instead of dying on the lookup.
  if (typeof found === "string") {
    if (opts.apiKey) {
      const ai = await geminiFullMeaning(
        text,
        opts.sentence,
        opts.apiKey,
        fetchFn,
      );
      if (ai) return { status: "ready", model: ai };
    }
    return {
      status: found === "offline" ? "offline" : "not-found",
      query: text,
    };
  }
  if (found.word && !found.word.trim()) found.word = text;
  return { status: "ready", model: found };
}
