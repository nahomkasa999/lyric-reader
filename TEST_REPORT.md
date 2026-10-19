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

---

# TEST_REPORT v2 — reference UI adoption + the 4 fixes (Oct 19, 2026)

Full UI-layer rebuild: reference look (Library home, reader chrome, sheets,
stage mask, heading/bullet styles), typed page jump, one-card staggered
action popup with persisted highlights/bookmarks, auto-hiding bottom nav,
dedicated Settings page. Engine (segment/structure/extract/db logic, paging,
trail/restore, persistence) untouched.

## Unit tests — `npx vitest run`

**30/30 passed** (4 files): lib unchanged, all green as required.

## Interaction tests — `npx playwright test tests/e2e/reader.spec.ts`

**23/23 passed** (Chromium headless, phone viewport 390×844, against
`vite preview` serving `dist`):

Core flows (7): open at first sentence; exactly one sentence per keypress +
trail grows; page-boundary clear + scroll-back restore; upcoming previews;
position persists across reload; page button shows "1 / 5" and opens the
jump sheet; offline reload works.

Typed jump (4): type page number + Enter/Go jumps there; out-of-range
clamps to last page with inline "Only 5 pages" hint; empty input shows a
hint instead of jumping; section list jumps to a heading page.

Action popup (4): middle-third tap opens ONE card with 3 staggered rows
(animation delays verified distinct and ordered); Highlight toggles and
survives reload; Bookmark shows a dot marker + lists the page in the jump
sheet; Copy writes the raw sentence text to the clipboard and shows
"Copied".

Bottom nav (3): hidden initially → visible on bottom hot-zone tap → hidden
again after the 2.5s auto-hide; hot-zone tap never advances the sentence;
› advances a page and « returns to the previous section page.

Settings (5): gear opens the Settings page; main-size slider drives the
live preview (48px) and the reader; font chip changes `--lr-font`;
settings persist across reload (localStorage → CSS vars); A−/A+ adjust the
same main-size setting; settings page also opens from the library gear and
Back returns to the library.

**Four real bugs were caught by these tests and fixed** (not test
artefacts):

1. **Stale closure silently disabled Highlight/Bookmark/Copy.**
   `toggleMarkKind`/`doCopy` were `useCallback(..., [bookId])` but read the
   current sentence through a helper closed over the first render — where
   the book wasn't loaded yet, so they always saw `undefined` and returned
   early with no error. Fixed by closing over the fresh `current` with
   correct deps; the helper was deleted.
2. **Out-of-range jump closed the sheet before the hint could be seen.**
   `gotoPage` unconditionally closed the jump sheet, so the clamp hint
   never rendered. Out-of-range jumps now set position directly and keep
   the sheet open with the hint.
3. **Bottom-nav hover/tap race.** A mouse moving into the hot zone fired
   the hover reveal, then the tap itself toggled the bar back off — the
   same race a desktop user would hit. Hot-zone taps now always reveal;
   the 2.5s auto-hide dismisses.
4. **Hidden bar wasn't really hidden.** It used opacity:0 only, which
   Playwright (correctly) still treats as visible. Now also
   `visibility: hidden` (delayed to let the 250ms fade finish).

## Screenshots — `npx playwright test tests/e2e/shots.spec.ts`

**2/2 suites passed**, 7 PNGs captured from the real build and eyeballed:

| File | Shows |
|---|---|
| `library-phone.png` | Headline + sub, gear, "Start reading a book" CTA, paste area, book card row |
| `reader-mid-phone.png` | Top bar (← Library · 1/5 · A− A+ ⚙), indigo progress hairline, muted trail, big current sentence, dim upcoming |
| `jump-sheet-phone.png` | Typed "3" input, "of 5 pages", Go button, sections list |
| `popup-phone.png` | One card, 3 rows (Highlight/Bookmark/Copy) |
| `bottom-nav-phone.png` | « ‹ › » bar revealed over the reader |
| `settings-phone.png` | Font chips, sliders, highlight chips, colour+opacity rows, Reset, live preview |
| `reader-desktop.png` | Reader at 1280×800 |

Old v1 shots (`reader-start-phone`, `reader-bullet-phone`,
`reader-overlay-phone`) were retired — their UI no longer exists.

## Build

`npx tsc -b` clean, `npm run build` succeeds (dist regenerated with the new
UI; prebuild regenerates fonts/icons as before).

## v3 — the user's own reader mechanics + notes + Saved (Oct 19, 2026)

The reader core was rebuilt as a faithful port of the user's reference code
(item stream, his exact splitS, per-part stepping, translating track with
his place() rule, click-first input, anchored popup with the .fx focus
effect, inline page number). Extraction (extract/segment/structure) was not
touched.

### Unit (vitest) — 35/35 passed
- segment.test.ts: 9 (Intl.Segmenter + abbreviation rules, unchanged)
- structure.test.ts: 6 (unchanged)
- parts.test.ts: 5 (NEW — splitS: ≤130 unsplit; 200-char → 2 parts at the
  comma; 360-char → 3 parts; space fallback; parts rejoin to the original)
- paging.test.ts: 12 (rewritten — his page rule: heading break + 7-item cap;
  stepParts part-first/back-to-last-part/clamps; item-based progressOf;
  migratePosition old→new)
- extract.test.ts: 3 (updated to the item model — heading page breaks,
  ≤7/page on the sample; EPUB title/headings/bullets; PDF keeps real pages)

### E2E (Playwright, Chromium, phone 390×844, against vite preview of dist) — 33/33 passed
- Core flows (6): opens at first item; one part per keypress; current part
  bright / siblings muted; visibility window (far beyond I±1/I−2); page
  boundary rebuilds track + (item,part) persists across reload; offline reload.
- Clicks are the primary input (6): tap next/prev sentence steps; non-adjacent
  tap does nothing; tap muted half of split sentence activates it;
  double-tap active part opens popup; single tap on single-part opens popup.
- Popup focus effect (1): .fx applied on open (chrome blurs), removed on
  close (asserted via class + computed filter).
- Popup actions on the part (3): highlight washes only the active part and
  persists across reload; bookmark dot; copy writes the part text + "Copied".
- Inline page number (4): label reads Page [n] / N · pct%; type + Enter jumps
  (no popup anywhere); 999 clamps to last page, garbage reverts; Escape
  cancels and restores.
- Bottom nav (3): hidden → hot-zone tap reveals → auto-hides; hot-zone tap
  doesn't advance; › next page, « previous heading item.
- Settings page (5): gear opens page; main-size slider drives reader; Lexend
  chip changes --lr-font; persistence across reload (40px + amber chip);
  A−/A+ adjust the same setting; library gear entry point.
- Notes (2): note on a part persists across reload with indicator dot;
  deleting a note removes the indicator.
- Saved view (3): empty state; bookmark+highlight+note listed, tapping the
  highlight entry lands the reader on that exact part; reachable from the
  library header.

### Screenshots — 2/2 suites passed, 9 PNGs regenerated
library, reader-mid (3-sentence spacing), reader-parts (part 2 lit),
popup (anchored card + fx blur), page-input (edit state), bottom-nav,
settings, saved (populated), reader-desktop. Eyeballed against the
reference: spacing, mask fade, popup anchor and fx effect all match.

### Bugs the new tests caught (all fixed)
1. Input listeners never attached: the native stage-listener effect ran once
   during the loading state (no stage yet) and never re-ran — key/click/wheel
   were dead. Fixed by adding `book` to the effect deps.
2. Escape in the page field committed the cancelled value: the blur() fired
   the stale-closure onBlur which re-committed. Fixed with a cancel flag.
3. Test-side: track .35s transition made click coordinates stale — helpers
   now wait 450ms before reading boxes; navigate-by-text instead of
   press-counting in the shots spec.
4. Test-side: off-by-one press counts (11 presses = item 10 part 1) and
   wrong page arithmetic in expectations.

### Honest gaps
- Chromium-only e2e (same as v1/v2); touch swipe covered by unit-adjacent
  logic, not a real touch device.
- `nav-prev-page` / `nav-next-section` share the tested toPage/chap paths
  but aren't individually clicked.
- Screenshots eyeballed by the builder, not by Nahom.

## v3.1 — unified auto-hiding chrome (Oct 19, 2026, morning)

Nahom's follow-up: the top bar + progress bar should disappear exactly like
the bottom nav, for full-focus reading. Top bar, progress hairline and
bottom « ‹ › » now share one visibility state and one 2.5s idle timer
(Reader.tsx `chromeVisible`/`showChrome`; `.chrome-hidden` in index.css keeps
layout space so the stage never resizes). Reveal: top ~12% hot-zone tap,
bottom hot-zone tap, edge hover, 1.2s page-change flash, focus into chrome,
1.6s on first open. The timer re-arms while the inline page input is being
edited; the popup never forces chrome visible.

### Unit (vitest) — 35/35 passed
Unchanged from v3 (lib untouched).

### E2E (Playwright, Chromium, phone 390×844, against vite preview of dist) — 40/40 passed
- Core (6), clicks (6), fx (1), popup actions (3), inline page (4),
  bottom nav (3), settings (5), notes (2), Saved (3): all green, with the
  chrome-interacting tests updated to reveal the chrome first (existing
  `revealChrome` helper).
- New "unified auto-hiding chrome" (7): all hidden after settle; top
  hot-zone tap reveals all three and they hide again; hot-zone tap does not
  advance; reveal → type page → Enter jumps → chrome hides; no auto-hide
  while the page input is being edited; middle sentence tap opens the popup
  without revealing chrome; page change flashes the chrome.

### Screenshots — 2/2 suites passed, 10 PNGs
Regenerated: reader-mid (chrome-free stage), reader-parts (chrome-free),
reader-desktop (chrome-free); new reader-chrome-phone (chrome revealed).
Unchanged: library, popup, page-input, bottom-nav, settings, saved.
Eyeballed: the chrome-free stage is pure black with the ~3-sentence spacing;
the revealed shot shows top bar + progress + bottom nav together.

### Bugs the new tests caught (all fixed)
1. First e2e run failed 16 tests — the suite ran against a stale `dist`
   (tests target `vite preview`); rebuilt and re-ran. Lesson: rebuild
   before e2e, never trust `reuseExistingServer` to pick up source changes.
2. "double-tap on the active part" flaked in full-suite runs: that test read
   click coordinates inline without waiting out the .35s track transition,
   so clicks landed on stale positions. Switched it to the `dblTapPart`
   helper (which settles first), matching the other click tests.
3. Test-side: `chromeHidden` waited for the `chrome-hidden` class, but the
   screenshot caught the 250ms fade (and an unfinished .35s track slide)
   mid-transition on desktop — screenshots now use `chromeSettled` (class +
   600ms) for settled-stage shots.

### Honest gaps
- Chromium-only e2e (same as v1–v3); touch swipe covered by synthesized
  pointer/touch events, not a physical device.
- `nav-prev-page` / `nav-next-section` share the tested toPage/chap paths
  but aren't individually clicked.
- Screenshots eyeballed by the builder, not by Nahom.
