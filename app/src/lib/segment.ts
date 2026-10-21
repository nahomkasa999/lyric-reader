// Sentence splitting: Intl.Segmenter + abbreviation merge rules.
// Intl.Segmenter is good but splits on "Dr.", "Fig. 2", "3.14"-style
// fragments incorrectly, so we merge those back.
//
// Amharic (v4.10): its full stop is ፡ (U+1361) and it is written in
// runs — ፡፡፡፡ closes a paragraph. ICU's segmenter does not break on ፡
// AT ALL (in any locale, "am" included), so an Amharic book came out
// as one wall of text. The Ethiopic marks are therefore split here, by
// hand, and the text is segmented with the "am" locale when it is
// Ethiopic.

const ABBREV = new Set([
  "dr", "mr", "mrs", "ms", "miss", "st", "mt", "prof", "sr", "jr",
  "gen", "sen", "rep", "rev", "hon", "gov", "pres", "capt", "col",
  "sgt", "lt", "cpl", "pvt", "inc", "ltd", "co", "corp", "fig",
  "no", "nos", "vs", "approx", "dept", "est", "univ", "assn",
  "e.g", "i.e", "a.m", "p.m",
]);

/**
 * The Ethiopic sentence marks: the full stop ፡ (U+1361), the semicolon
 * ። (U+1362) — which many Amharic texts use as their period — and the
 * question mark ፧ (U+1367).
 */
const ETHIOPIC_END = "፡።፧";

/** Any Ethiopic character — the script detector. */
const ETHIOPIC_RE = /[\u1200-\u137F\u1380-\u139F]/;

/** A real sentence end, in any of the scripts the app reads. */
const SENTENCE_END_RE = /[.?!…፡።፧]$/;

/** Trailing closers that may follow terminal punctuation: `client.”` */
const TRAILING_CLOSERS = /[”’"'»›\])}]+$/;

/**
 * Split a fragment at the Ethiopic marks. A RUN of them is one ending:
 * "ነው፡፡፡፡" is a single sentence end, not four. The run stays with the
 * sentence before it, so the reader shows the text exactly as it was
 * written.
 */
function splitEthiopic(frag: string): string[] {
  if (!ETHIOPIC_RE.test(frag)) return [frag];
  const out: string[] = [];
  let buf = "";
  for (const piece of frag.split(new RegExp(`([${ETHIOPIC_END}]+)`))) {
    if (!piece) continue;
    const isRun = ETHIOPIC_END.includes(piece[0]);
    buf += piece;
    // A run of marks ends the sentence — but only if there is a sentence
    // to end (a text that starts with marks keeps them).
    if (isRun && buf.trim().length > piece.length) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf);
  return out.length ? out : [frag];
}

/** True when a fragment ends with something that is NOT a real sentence end. */
function isFalseBoundary(frag: string, next: string | undefined): boolean {
  // Strip trailing closers (quotes, brackets) so `dream client.”` is
  // judged by its period, not by the quote mark.
  const t = frag.trimEnd().replace(TRAILING_CLOSERS, "");
  if (!t) return true;
  if (!SENTENCE_END_RE.test(t)) return true; // segmenter split mid-sentence

  // Ends with a period — check for abbreviations.
  if (t.endsWith(".")) {
    const word = t.slice(0, -1).split(/\s+/).pop() ?? "";
    const w = word.toLowerCase().replace(/^[^a-z0-9.]*|[^a-z0-9.]*$/g, "");
    if (ABBREV.has(w)) return true;
    // Single capital letter initial: "J. K. Rowling"
    if (/^[A-Z]$/.test(word)) return true;
    // Number directly before the period with a lowercase continuation:
    // "version 3. x" is not a sentence end, "He scored 3. He left." is.
    if (/\d$/.test(word) && next && /^[a-z]/.test(next.trimStart()))
      return true;
    // Ellipsis followed by lowercase continuation: "Wait... what happened"
    if (/\.\.\.$/.test(t) && next && /^[a-z]/.test(next.trimStart()))
      return true;
  }
  return false;
}

export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  let segmenter: Intl.Segmenter | null = null;
  // Amharic text is segmented with its own locale; everything else with
  // English (the abbreviations rules below are English).
  const locale = ETHIOPIC_RE.test(clean) ? "am" : "en";
  try {
    segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
  } catch {
    segmenter = null;
  }
  const raw: string[] = segmenter
    ? [...segmenter.segment(clean)].map((s) => s.segment)
    : clean.split(/(?<=[.?!…፡።፧])\s+/);

  // The Ethiopic marks are the splitter's blind spot — cut on them here.
  const frags = raw.flatMap(splitEthiopic);

  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < frags.length; i++) {
    buf += frags[i];
    const next = frags[i + 1];
    if (next === undefined || !isFalseBoundary(buf, next)) {
      const s = buf.replace(/\s+/g, " ").trim();
      if (s) out.push(s);
      buf = "";
    }
  }
  const tail = buf.replace(/\s+/g, " ").trim();
  if (tail) out.push(tail);
  return out;
}
