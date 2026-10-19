// Long-sentence part splitting — ported from the user's reference reader
// (splitS in his index.html). Long sentences are read in parts: each gesture
// moves one part, the current part stays bright while the others sit in
// trail colour.
//
// v4.3 fixes: visibly long sentences that wrap over 4–5 lines were kept as
// one bright block because the old gate was 130 chars and cuts only looked
// for ASCII punctuation followed by an ASCII space. We now split above 100
// chars, accept quotes/brackets/full-width/Ethiopic punctuation, treat any
// whitespace as a valid fallback, and hard-cut as a last resort (CJK / long
// unbroken tokens) so a long sentence can never silently stay unsplit.
const SPLIT_ABOVE = 100;
const TARGET_PART = 120;
const MIN_PART = 25;

// Pause marks that can end a read-aloud chunk.
const CLAUSE = new Set([
  ",",
  ";",
  ":",
  "—",
  "–",
  ")",
  "]",
  "}",
  "»",
  "，",
  "、",
  "；",
  "：",
  "。",
  "！",
  "？",
  "፣",
  "፤",
  "፥",
  "፦",
  "፧",
  "፨",
  "።",
]);

// Characters that may trail a pause mark ("word," / word.” / word.))
const TRAILING = new Set([
  ")",
  "]",
  "}",
  "»",
  '"',
  "'",
  "”",
  "’",
  "」",
  "』",
  "】",
  "》",
]);

const isSpace = (ch: string | undefined): boolean =>
  ch !== undefined && /\s/.test(ch);

// CJK / Ethiopic punctuation carries no following space.
const isScriptPunct = (ch: string): boolean => {
  const c = ch.charCodeAt(0);
  return c >= 0x3000 || (c >= 0x1361 && c <= 0x1368);
};

function cutCandidates(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (!CLAUSE.has(s[i])) continue;
    let j = i + 1;
    while (j < s.length && TRAILING.has(s[j])) j++;
    // Space-separated scripts need a gap after the mark. CJK/Ethiopic
    // punctuation is followed directly by the next clause.
    if (j === s.length || isSpace(s[j]) || isScriptPunct(s[i])) out.push(j);
  }
  return out;
}

function nearestSpace(
  s: string,
  ideal: number,
  lo: number,
  hi: number,
  radius: number,
): number {
  for (let d = 0; d <= radius; d++) {
    const a = ideal + d;
    if (a > lo && a < hi && isSpace(s[a])) return a;
    const b = ideal - d;
    if (b > lo && b < hi && isSpace(s[b])) return b;
  }
  return -1;
}

export function splitS(s: string): string[] {
  if (s.length <= SPLIT_ABOVE) return [s];
  const n = s.length;
  const k = Math.max(2, Math.ceil(n / TARGET_PART));
  const min = Math.min(MIN_PART, Math.floor(n / (k * 2)));
  const cand = cutCandidates(s);
  const cuts: number[] = [];
  for (let j = 1; j < k; j++) {
    const ideal = Math.round((n * j) / k);
    const last = cuts.length ? cuts[cuts.length - 1] : 0;
    const lo = last + min;
    const hi = n - min;
    if (lo >= hi) continue;
    let best = -1;
    let bd = Infinity;
    for (const c of cand) {
      if (c <= lo || c >= hi) continue;
      const d = Math.abs(c - ideal);
      if (d < bd && d < (n / k) * 0.45) {
        best = c;
        bd = d;
      }
    }
    if (best < 0) {
      best = nearestSpace(s, ideal, lo, hi, Math.ceil((n / k) * 0.5));
    }
    if (best < 0) best = nearestSpace(s, ideal, lo, hi, n);
    if (best < 0) {
      // No break opportunity at all (CJK, URLs, an unbroken token): cut at
      // the ideal point rather than leaving the sentence as one bright part.
      best = Math.min(hi - 1, Math.max(lo + 1, ideal));
      // Never split a surrogate pair.
      const code = s.charCodeAt(best);
      if (code >= 0xdc00 && code <= 0xdfff) best -= 1;
      if (best <= last) continue;
    }
    cuts.push(best);
  }
  const out: string[] = [];
  let a = 0;
  cuts.forEach((c) => {
    out.push(s.slice(a, c));
    a = c;
  });
  out.push(s.slice(a));
  return out.filter((x) => x.trim());
}
