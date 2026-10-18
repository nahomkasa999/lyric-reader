# TEST_REPORT.md — Lyric Reader v1

Built and tested overnight Oct 18–19, 2026. Every result below was actually
run on this machine — nothing is claimed from reasoning alone.

## Unit tests — `npx vitest run`

**30/30 passed** (4 files, ~3s):

| File | Tests | Covers |
|---|---|---|
| `tests/segment.test.ts` | 9 | Sentence splitting incl. `Dr.`, `e.g.`/`i.e.`, `3.14`, `Fig. 2`, ellipses, `J. K.` initials, whitespace collapse, empty input |
| `tests/structure.test.ts` | 6 | Paragraphs, `#` headings, bullet nesting by indent (incl. deep), numbered bullets, lone-line heading heuristic, no false headings |
| `tests/paging.test.ts` | 9 | `step()` forward/back within page, page-boundary crossing, clamping at book ends, trail/upcoming slices, trail restore on scroll-back, `paginate()` chunking, heading-as-own-sentence, `progressOf()` |
| `tests/extract.test.ts` | 6 | TXT sample book (60 sentences, headings, nested bullets, mockup sentences in order), EPUB fixture (title/headings/bullets/levels from a jszip-built EPUB), PDF fixture (pdf-lib 2-page PDF → 2 reader pages, order preserved, `Dr.` not split) |

Two real bugs were caught and fixed during this run: a double-space in the
sentence merge, and EPUB bullet levels off by one. Both are covered by the
tests above.

## Interaction tests — `npx playwright test tests/e2e/reader.spec.ts`

**7/7 passed** (Chromium headless, against `vite preview` serving `dist`):

1. Opens the sample book at the first sentence — passed
2. Advances exactly one sentence per keypress; trail grows — passed
3. Page boundary clears the trail; scrolling back restores it exactly — passed
4. Upcoming block previews the next sentences — passed
5. Persists position across reload — passed
6. Tap overlay shows `Page x of y · %`, back returns to library — passed
7. Reader works offline after first load (SW-controlled reload) — passed

Two more real bugs were caught here and fixed: the service worker was
generated but never registered, and reload landed on the library instead of
resuming the book (fixed as a feature: the last-open book is remembered).

## Screenshots — `npx playwright test tests/e2e/shots.spec.ts`

**2/2 suites passed**, 6 PNGs captured from the real build and eyeballed
against the mockup:

- `screenshots/library-phone.png` — library (390×844)
- `screenshots/reader-start-phone.png` — page start, heading as title card
- `screenshots/reader-mid-phone.png` — muted trail above, huge current
  sentence, muted upcoming below — matches the mockup's composition
- `screenshots/reader-bullet-phone.png` — nested bullet with the hairline
- `screenshots/reader-overlay-phone.png` — overlay: back, page/progress,
  A−/A+, progress bar
- `screenshots/reader-desktop.png` — 1280×800 with the 56rem column cap

## Build & PWA checks

- `tsc -b` — clean, zero errors.
- `npm run build` — success; `dist/` = 2.3MB (includes the pdf.js worker),
  with `sw.js`, `manifest.webmanifest`, 192/512/maskable icons, and all five
  self-hosted font files precached.
- Manifest verified: name, `display: standalone`, black theme/background,
  `start_url`/`scope`, three icons.
- Offline reload verified by the e2e test above (real SW, real offline).
- Icons pixel-verified by script: indigo bars on black, transparent rounded
  corners.

## Not run (honest list)

- **Lighthouse PWA audit** — not installed here; installability criteria were
  verified directly instead (manifest + ≥144px icons incl. maskable +
  registered SW + offline fallback + theme-color + viewport). Worth one run
  in desktop Chrome when convenient.
- **Physical-device testing** — touch swipe and the Android "Add to Home
  screen" flow have not been tried on a real phone yet. The gesture logic is
  pointer-event based and covered by the one-step-per-gesture tests, but the
  first install on Nahom's phone is the real feel check.
- **Real-world PDFs/EPUBs** — extraction verified on generated fixtures and
  the sample text only; a dense two-column textbook PDF is the known risky
  case (documented in README).

## Feel pass (mine)

Read through the sample in the built reader via keyboard: the 300ms
rise-and-settle on each advance feels like the mockup's Spotify energy; the
trail at 28% never competes; the page-boundary clear is noticeable but soft,
and scrolling back restores the exact stack. Wheel input can't advance two
sentences per flick (600ms lock + functional state update). No layout thrash:
the advance animates transform/opacity only. One nit: very long sentences
drop to 1.4rem which is correct but plainly less dramatic — inherent to the
design, not a bug.
