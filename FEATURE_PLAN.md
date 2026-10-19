# Feature plan — vocab, ask, exams (Nahom, Oct 19, 2026)

Agreed direction from the Oct 19 morning design conversation. **Sections 1
and 2 are BUILT (v4, Oct 19, 2026 — 65/65 unit + 55/55 e2e, all green);
exams (section 3) intentionally deferred.** Priority order per Nahom: (1)
selection + meanings + saved words, (2) ask, (3) exams later.

## 1. Selection + Meaning + Words (first)
- Long-press wakes text selection on the current sentence (taps keep working
  as reading input); drag covers a word/phrase/idiom; floating pill at the
  selection: Meaning / Copy. Tap anywhere else dismisses (same language as
  the popup).
- Meaning card anchored at the sentence: word in reading type, phonetic
  muted, definition lines, optional "In this sentence: ..." AI line, Save
  word action. Saved words get a faint dotted underline in the text.
- Sources: free dictionary API for plain words (instant, exact); Gemini for
  phrases/idioms/context. Saved meanings stored on-device -> work offline.
- Words page next to Saved: grouped by day (Today / Yesterday / date) with
  counts; row = word, one-line meaning, book + page source; tap -> jump to
  that exact sentence/part.

## 2. Ask (the "?" button)
- Ghost "?" button bottom-right that JOINS THE UNIFIED AUTO-HIDE CHROME
  (disappears while reading like the top bar / bottom nav; revealed by the
  same hot-zones / page-change flash). Nahom, Oct 19 08:56: "it should also
  disappear like the others."
- Opens a bottom sheet over the blurred stage (fx language), with a context
  chip (Page N - book). Context sent to the AI: full current page + previous
  and next page, current sentence marked, section heading + book title, any
  selected text; instruction: answer only from the passage and cite the
  sentence used. Follow-ups keep the context. Tap quoted sentence -> jump.

## 3. Exams (later)
- Generated in the background near a checkpoint (section/heading end, or
  every N pages per Settings); the next scroll past the checkpoint presents
  the exam as a gate card in the track (Start / Later). One question at a
  time in the centre spot, options stacked like sentences, soft feedback
  (highlight wash = right; dim + show correct = wrong), calm score line,
  Continue reading resumes exactly. Later = waits, marked on the library
  book row, no nagging.

## Engine / sharing decisions
- Gemini via bring-your-own-key (Settings field, key stays on-device) -
  required if the app is shared; Nahom's key must never ship inside it.
- Plain-word meanings stay keyless (dictionary API). Local on-device LLM =
  later optional offline upgrade (1-2GB download, WebGPU lottery, slow).
- Settings additions: Gemini key row, Exams row (Section end / Every N
  pages / Off).
