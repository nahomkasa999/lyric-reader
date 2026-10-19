// Sentence splitting: Intl.Segmenter + abbreviation merge rules.
// Intl.Segmenter is good but splits on "Dr.", "Fig. 2", "3.14"-style
// fragments incorrectly, so we merge those back.

const ABBREV = new Set([
  "dr", "mr", "mrs", "ms", "miss", "st", "mt", "prof", "sr", "jr",
  "gen", "sen", "rep", "rev", "hon", "gov", "pres", "capt", "col",
  "sgt", "lt", "cpl", "pvt", "inc", "ltd", "co", "corp", "fig",
  "no", "nos", "vs", "approx", "dept", "est", "univ", "assn",
  "e.g", "i.e", "a.m", "p.m",
]);

/** Trailing closers that may follow terminal punctuation: `client.”` */
const TRAILING_CLOSERS = /[”’"'»›\])}]+$/;

/** True when a fragment ends with something that is NOT a real sentence end. */
function isFalseBoundary(frag: string, next: string | undefined): boolean {
  // Strip trailing closers (quotes, brackets) so `dream client.”` is
  // judged by its period, not by the quote mark.
  const t = frag.trimEnd().replace(TRAILING_CLOSERS, "");
  if (!t) return true;
  if (!/[.?!…]$/.test(t)) return true; // segmenter split mid-sentence

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
  try {
    segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  } catch {
    segmenter = null;
  }
  const raw: string[] = segmenter
    ? [...segmenter.segment(clean)].map((s) => s.segment)
    : clean.split(/(?<=[.?!…])\s+/);

  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < raw.length; i++) {
    buf += raw[i];
    const next = raw[i + 1];
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
