// Meaning lookup: free dictionary API for single words (exact, instant),
// Gemini for phrases / idioms / "as used in this sentence".
// fetch is injectable so tests run fully offline with stubs.
import { GeminiError } from "./gemini";
import { aiGenerate } from "./ai";

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

interface FreeDictSense {
  definition?: string;
  examples?: Array<string | { example?: string }>;
}
interface FreeDictEntry {
  language?: { code?: string };
  partOfSpeech?: string;
  pronunciations?: Array<{ type?: string; text?: string }>;
  senses?: FreeDictSense[];
}
interface FreeDictPayload {
  word?: string;
  entries?: FreeDictEntry[];
}

/**
 * v4.3: Free Dictionary API shape (https://freedictionaryapi.com) — already
 * parsed Wiktionary data with IPA and clean strings, served with CORS.
 */
export function parseFreeDictionaryEntry(
  json: unknown,
): MeaningModel | null {
  const p = json as FreeDictPayload;
  if (!p || !Array.isArray(p.entries)) return null;
  const entries = p.entries.filter(
    (e) => !e.language?.code || e.language.code === "en",
  );
  if (!entries.length) return null;
  const phonetic = entries
    .flatMap((e) => e.pronunciations ?? [])
    .find((pr) => pr.type === "ipa" && pr.text?.trim())?.text;
  const groups: DictPos[] = [];
  for (const e of entries) {
    const defs: DictDef[] = [];
    for (const sense of e.senses ?? []) {
      const definition = sense.definition?.trim();
      if (!definition) continue;
      const example = (sense.examples ?? [])
        .map((x) => (typeof x === "string" ? x : x?.example))
        .find((x) => x && x.trim());
      defs.push({ definition, example: example?.trim() || undefined });
      if (defs.length >= 2) break;
    }
    if (defs.length) {
      groups.push({
        partOfSpeech: e.partOfSpeech?.trim() || "word",
        defs,
      });
    }
  }
  if (!groups.length) return null;
  return {
    word: p.word?.trim() || "",
    phonetic: phonetic?.trim() || undefined,
    groups,
  };
}

interface WiktDef {
  definition?: string;
  examples?: string[];
}
interface WiktEntry {
  partOfSpeech?: string;
  definitions?: WiktDef[];
}

/** Strip the wiki markup/HTML that Wiktionary definitions contain. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, d: string) =>
      String.fromCodePoint(Number(d)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Wiktionary REST definition shape (fallback when the free API is down). */
export function parseWiktionaryEntry(
  json: unknown,
  word = "",
): MeaningModel | null {
  const p = json as { en?: WiktEntry[] };
  if (!p || !Array.isArray(p.en) || !p.en.length) return null;
  const groups: DictPos[] = [];
  for (const e of p.en) {
    const defs: DictDef[] = [];
    for (const d of e.definitions ?? []) {
      const definition = stripHtml(d.definition ?? "");
      if (!definition) continue;
      const example = (d.examples ?? []).map(stripHtml).find(Boolean);
      defs.push({ definition, example: example || undefined });
      if (defs.length >= 2) break;
    }
    if (defs.length) {
      groups.push({
        partOfSpeech: (e.partOfSpeech ?? "word").toLowerCase(),
        defs,
      });
    }
  }
  if (!groups.length) return null;
  return { word, groups };
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

// v4.3: api.dictionaryapi.dev now answers with a Cloudflare 403 challenge
// (no CORS), which made every lookup show as "offline". The free dictionary
// API proxies Wiktionary and returns clean JSON + CORS; the Wiktionary REST
// endpoint is the last-resort fallback if that host is unreachable.
const FREE_DICT_URL = "https://freedictionaryapi.com/api/v1/entries/en/";
const WIKT_URL = "https://en.wiktionary.org/api/rest_v1/page/definition/";

interface LookupOpts {
  text: string;
  sentence: string;
  apiKey: string;
  fetchFn?: typeof fetch;
}

function cleanText(t: string): string {
  // The Ethiopic marks are stripped too — a selected Amharic word often
  // carries its full stop with it.
  return t
    .replace(/^["'“”‘’\(\[\u1361\u1362\u1367]+|["'“”‘’\)\]\.,;:!?\u1361\u1362\u1367]+$/g, "")
    .trim();
}

interface JsonResult {
  ok: boolean;
  status: number;
  json?: unknown;
}

async function fetchJson(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs = 6000,
): Promise<JsonResult> {
  // A timeout so a hanging dictionary can't stall the lookup forever.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: ctl.signal });
    if (!res.ok) return { ok: false, status: res.status };
    try {
      return { ok: true, status: res.status, json: await res.json() };
    } catch {
      return { ok: false, status: res.status };
    }
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFreeWord(
  word: string,
  fetchFn: typeof fetch,
  timeoutMs = 6000,
): Promise<MeaningModel | "not-found" | "offline"> {
  const r = await fetchJson(FREE_DICT_URL + encodeURIComponent(word), fetchFn, timeoutMs);
  if (!r.ok) return r.status === 404 ? "not-found" : "offline";
  return parseFreeDictionaryEntry(r.json) ?? "not-found";
}

async function fetchWiktionaryWord(
  word: string,
  fetchFn: typeof fetch,
  timeoutMs = 6000,
): Promise<MeaningModel | "not-found" | "offline"> {
  const r = await fetchJson(WIKT_URL + encodeURIComponent(word), fetchFn, timeoutMs);
  if (!r.ok) return r.status === 404 ? "not-found" : "offline";
  return parseWiktionaryEntry(r.json, word) ?? "not-found";
}

/** Free dictionary first; direct Wiktionary only if that host failed. */
async function fetchWord(
  word: string,
  fetchFn: typeof fetch,
  timeoutMs = 6000,
): Promise<MeaningModel | "not-found" | "offline"> {
  const free = await fetchFreeWord(word, fetchFn, timeoutMs);
  if (free !== "offline") return free;
  return fetchWiktionaryWord(word, fetchFn, timeoutMs);
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
    const raw = await aiGenerate({
      apiKey: apiKey,
      json: true,
      maxTokens: 1024,
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
    const raw = await aiGenerate({
      apiKey: apiKey,
      json: true,
      maxTokens: 1024,
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
    const text = await aiGenerate({
      apiKey: apiKey,
      maxTokens: 512,
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
