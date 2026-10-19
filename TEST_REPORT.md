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

## v3.2 — tap-outside popup dismissal (Oct 19, 2026, morning)

User-reported fix: the action popup had no tap-outside dismissal path on
touch (only Esc worked). Implemented a capture-phase pointerdown handler on
the reader root: any tap outside the card closes the popup and swallows the
gesture (450ms click-suppression for stage + chrome controls).

Verification this time: `npx tsc -b` clean + `npm run build` green.
The Playwright e2e suite was INTENTIONALLY NOT RUN — the user's explicit
instruction: "after the edit don't do like e2e or any testing, just push
after linting test". Only typecheck + build ran; interactive verification
of the dismissal is left to him on his phone. No push made by this agent
(the parent pushes).

## v4 — selection + Meaning + Words + Ask (?) (Oct 19, 2026, afternoon)

Full pass, everything green, same as v3.1. Verified this time: `npx tsc
-b` clean + `npm run build` green + the ENTIRE suite (old + new).

## Unit tests — `npx vitest run`

**65/65 passed** (8 files; was 35/35 in v3.1, +30 new):

| File | Tests | Covers |
|---|---|---|
| `tests/meaning.test.ts` | 12 | dictionary payload parsing (word/phonetic/POS, first 2 defs each, phonetics[] fallback, null on unusable payloads), lemmatizer inflections + refusals, lookup: dictionary hit, 404→lemma retry, double-miss not-found, offline, phrase needs-key, phrase via Gemini JSON, malformed Gemini reply |
| `tests/askContext.test.ts` | 9 | context builder: sentence marked with `>>> <<<`, prev/next page inclusion + ends, nearest-heading pick, instruction wording; `findQuote` exact item/part match, part-level fallback, null on non-exact; `splitQuotes` segmentation |
| `tests/vocab.test.ts` | 9 | `dayKey` local YYYY-MM-DD, Today/Yesterday/"Mon 12 Oct" labels, `groupByDay` ordering + labels, `decorateText` word-boundary/case-insensitive, no match inside other words, longest-norm-first overlap, no-norms passthrough |

Real bug caught during this run: none — all new tests passed on first
run against the written code.

## Interaction tests — `npx playwright test`

**56/56 passed** (Chromium headless, `vite preview` serving `dist`;
was 42/42 in v3.1 — 40 in reader.spec.ts + 2 in shots.spec.ts; +13 new in
`tests/e2e/vocab-ask.spec.ts`, +1 new v4 screenshots test). The entire old
suite stayed green — the v4 overlay/suppression machinery broke none of
his v3/v3.1/v3.2 reader mechanics. BOTH network APIs were stubbed via
route interception (dictionaryapi.dev + generativelanguage.googleapis.com
return canned payloads), so the whole run was fully offline. New coverage:

1. Selecting a word raises the pill; Meaning opens the card with the stubbed definition — passed
2. Arrow keys don't step while a selection is active; Esc frees input — passed
3. Tapping elsewhere collapses the selection without stepping — passed
4. Copy writes the selected text and closes the pill — passed
5. Saving a word underlines it; the underline persists across reload — passed
6. Phrase without a key shows the key path; with a key Gemini defines it (incl. "In this sentence") — passed
7. Words view groups under Today with a count; tapping the row jumps to the exact sentence — passed
8. Deleting a word removes it and its underline — passed
9. Words empty state is calm — passed
10. The ? button hides/shows with the chrome — passed
11. Ask without a key explains the key path and links to Settings — passed
12. Ask answer renders with a tappable «quote»; tapping jumps to the sentence and closes the sheet — passed
13. Follow-ups keep the thread; the thread persists across reload — passed

One test authoring issue was fixed mid-run: the `needs-key` meaning card
state lacked the `meaning-close` testid its close button needed (now on
all four card close buttons). One flake observed in the final rerun: the
old "tapping the next sentence advances one step" test failed once in a
full-suite run, then passed in isolation, as a file, and in the next full
rerun — timing flakiness, no code change implicated.

## Screenshots — `npx playwright test tests/e2e/shots.spec.ts`

**3/3 suites passed**; 5 new 390×844 PNGs captured from the real build
with stubbed APIs and eyeballed by the builder:
`selection-pill-phone.png`, `meaning-card-phone.png`, `words-phone.png`,
`ask-sheet-phone.png`, `ai-settings-phone.png`. All 10 earlier screenshots
regenerated unchanged in the same run.

### Honest gaps
- Chromium-only e2e (same as v1–v4); native long-press and Android's own
  selection menu were NOT tested on a physical device — the headless suite
  drives selection through programmatic ranges (same `selectionchange`
  path), so the pill/meaning/save flow is covered but the native touch
  interplay is a real gap left for his phone.
- No real network was ever touched in tests: dictionary, phrase meaning,
  key test ping, and Ask answers all ran against canned stubs. Real-API
  behaviour (dictionary edge words, Gemini latency/wording) is untested.
- Screenshots eyeballed by the builder, not by Nahom.

## v4.1 — custom selection, model discovery, card clamping (Oct 19, 2026, evening)

His three phone-reported bugs, fixed and test-passed. `npx tsc -b` clean +
`npm run build` green + the ENTIRE suite (old + new).

## Unit tests — `npx vitest run`

**77/77 passed** (9 files; was 65/65 in v4, +12 new):

| File | Tests | New in v4.1 |
|---|---|---|
| `tests/gemini.test.ts` | 9 | NEW FILE: `pickModel` — 3.5-flash beats 2.5-flash, preview/lite deprioritised within a tier, tier fallback, empty→null; `discoverModel` picks gemini-3.5-flash from a canned models payload and stores it in `lr-gemini-model`; key rejection → null; `testApiKey` reports "Key works — using gemini-3.5-flash" / reason; `geminiGenerate` re-discovers once and retries after a stale stored model 404s |
| `tests/meaning.test.ts` | 15 (was 12) | +3: dictionary network-death + key → Gemini full-meaning JSON renders in the same card shape (word/phonetic/defs/in-context); dictionary 404-after-lemmatizer + key → same fallback; dictionary death with no key → stays `offline` |

Real bugs caught during this run: two, both fixed before green —
(1) the 404-retry guard compared the *resolved* model against
`opts.model`, so a stale *stored* model never triggered re-discovery
(restructured: explicit override vs resolved model are now distinct paths);
(2) n/a at unit level (the e2e catches are below).

## Interaction tests — `npx playwright test`

**63/63 passed** (Chromium headless, `vite preview` serving `dist`;
was 56/56 in v4, +7 new):

| File | Tests | New/changed in v4.1 |
|---|---|---|
| `tests/e2e/v41.spec.ts` | 7 | NEW FILE, all APIs stubbed incl. `/v1beta/models`: (a) long-press via real pointer events → `CSS.highlights` has `lr-sel` with text "lamp", `window.getSelection()` stays collapsed (no native toolbar possible), pill visible, Meaning opens the card; (b) drag after long-press extends the painted range to "brass lamp"; (c) tap outside dismisses (pill gone, highlight cleared); (d) Test key discovers `gemini-3.5-flash` from the stubbed list and stores it; (e) dictionary route aborted + key set → meaning card still fills via the Gemini stub; (f) note editor opened on a bottom sentence → popup card bounding box fully inside the 390×844 viewport with ≥12px margins, note-save fully visible + clickable (typed + saved); (g) meaning card → same in-viewport assertion |
| `tests/e2e/vocab-ask.spec.ts` | 13 | `selectText` rewritten from programmatic native ranges to the real long-press gesture (mouse down 650ms + drag); stub adds the `/v1beta/models` route; Test-key assertion now expects "Key works — using gemini-3.5-flash" |
| `tests/e2e/reader.spec.ts` | 40 | unchanged — all still pass (click/tap semantics untouched) |
| `tests/e2e/shots.spec.ts` | 3 | selection screenshot now via real long-press; `/v1beta/models` stub added |

Real bugs caught during this run: three, all fixed before green —
(1) the e2e suite serves `vite preview` from `dist`, so the first v4.1 run
tested the STALE pre-change bundle (now: always `npm run build` before
`npx playwright test`); (2) the first pointerup implementation suppressed
the click after EVERY press with a pending long-press timer, which broke
normal taps (double-tap-to-popup regressed — caught by the existing
reader.spec.ts test); now only a selection that actually started
suppresses the following click; (3) late-arriving webfonts reflow card
text AFTER anchoring (measured 214px at anchor, 230px after fonts),
pushing the meaning card 10px off the right edge — fixed with a
ResizeObserver that re-runs the clamp on card size changes. One test-only
fix: after `settings-back` the remounted reader's track is mid-transition
(.35s), so the word-rect measurement went stale — the test now waits
600ms for it to settle.

## Screenshots — `npx playwright test tests/e2e/shots.spec.ts`

**3/3 suites passed**; regenerated from the real build with stubbed APIs
and eyeballed by the builder: `selection-pill-phone.png` REPLACED (custom
highlight wash on "lamp", Meaning/Copy pill, no native toolbar),
`meaning-card-phone.png` REPLACED, `note-editor-phone.png` ADDED (card
fully inside the viewport, textarea + Cancel/Save all visible). All other
screenshots regenerated unchanged.

### Honest gaps (v4.1)
- The custom long-press ran in headless Chromium with real pointer events;
  a real finger on his Android is still the first true touch test (timing,
  `caretRangeFromPoint` on his Chrome build, `-webkit-touch-callout`).
- No real network in tests: model discovery, the 404-retry, the dictionary
  timeout, and the Gemini fallback all ran against canned stubs. His phone
  is the first live run of discovery against his key.
- `CSS.highlights` fallback (word-only, no paint/drag) is coded but not
  exercised — no test browser lacks the API.
- Screenshots eyeballed by the builder, not by Nahom.

## v4.2 — docs-aligned Gemini + key links + timeouts (Oct 19, 2026)

- Unit: **88/88 across 10 files** (11 new: `apikey.test.ts` 4 for the
  `#k=` hash parser; `gemini.test.ts` now 16 — alias ordering, alias
  fallback after dead discovery, direct-alias first call, error-only-
  after-alias-fails, one-retry-then-success, network-fails-twice,
  Google-raw-error surfacing). No e2e in this pass (small edit).
- `npx tsc -b` clean; `npm run build` green (PWA 27 entries, ~1060 KiB).
- Docs: `DECISIONS.md` v4.2 entry (full docs-audit findings, incl. why
  the new Interactions API was NOT adopted), `lib/gemini.ts`,
  `lib/apikey.ts`, `App.tsx` (key-import effect + toast).
- Honest gaps: no live Google API from this VM (auth-key header and the
  alias path are verified only by stubs); the `#k=` link flow and the
  20s-timeout behaviour have no e2e coverage — his phone is the first
  real run of both.

## v4.3 — env-key mode (Oct 19, 2026)

- Unit: **93/93** across 10 files (`tests/apikey.test.ts` now 9: hash
  import parsing + 5 key-resolution precedence tests — personal > env >
  none, removeApiKey fallback, blank-env ignored; `vi.stubEnv` for
  `VITE_GEMINI_API_KEY`). Full suite green.
- `npx tsc -b` clean (`src/vite-env.d.ts` declares the env key);
  `npm run build` green.
- Key-leak check: grepped `dist/` for `AIza…` and `AQ.Ab8…` key patterns —
  **zero matches** (env unset in this build, as intended).
- Files: `src/lib/apikey.ts` (resolution), `src/components/Settings.tsx`
  (3-state AI section), `src/components/Reader.tsx` + `AskSheet.tsx`
  (effective key), `src/lib/meaning.ts` (3.5s dict timeout with a key),
  `src/vite-env.d.ts`, `README.md` (App key section), `DECISIONS.md`.
- Honest gaps: the actual env-key wiring on Vercel (env var + redeploy)
  hasn't happened yet — parent handles it; no e2e for the 3-state
  Settings UI (small-edit rule), his phone remains the first real run.

## v4.5 — quote-boundary split fix + stored-book self-heal (Oct 19, 2026)

- **Unit: 114/114** across 12 files (was 93/93). New/changed:
  `tests/segment.test.ts` (5 quote-boundary regressions incl. the
  verbatim $100M Offers fixture → exactly 2 sentences, `?”`/`!”`/straight
  quotes, parenthesised ends, no over-splitting on `“Dr. Smith.”` or
  mid-sentence quotes); `tests/resegment.test.ts` (4: merged item splits
  with page inherited + paraStart correct, untouched kinds, idempotent,
  empty); `tests/parts.test.ts` (1: the fixture's long sentence parts
  ≥2, join exactly, no part >160 chars, no mid-word cuts).
- **e2e: `tests/e2e/heal.spec.ts` — 1/1**: seeded a stored book with one
  merged 289-char para item via IndexedDB init script; on open the
  reader shows sentence 1 only, item-1 holds sentence 2 with 2+ parts
  and only the current part bright. (First run failed on a stale `dist`;
  rebuilt, then green.)
- `npx tsc -b` clean; `npm run build` green.
- Files: `src/lib/segment.ts` (trailing-closer strip in `isFalseBoundary`),
  `src/lib/types.ts` (`resegmentItems`), `src/lib/db.ts` (`getBook`
  wiring + persist-once), `DECISIONS.md` (root causes), tests above.
  components/Reader.tsx untouched (concurrent build in flight).
- Honest gaps: his original screenshot also shows NO parting at all,
  which the current build cannot produce — his phone was on a pre-v3
  build; the update path (service-worker activation) is his side. Marks
  keyed `item:part` are not remapped after a heal-split (accepted).

## v4.4 — auto-scroll (Oct 19, 2026)

- **Unit: 114/114 passed** (12 files) — new `tests/autoscroll.test.ts`
  (11: `paceMs` word scaling / speed division / 1200–6500ms clamps /
  invalid-speed fallback; `nextSpeed` 1→1.25→1.5→0.75→1 cycle; `isAutoSpeed`;
  `nextAutoStep` part-first advance, end-of-book, one-item book, empty book).
- **e2e: 73/73 passed** (Chromium, `vite preview` on dist) — new
  `tests/e2e/autoscroll.spec.ts` (9: plays ≥2 steps with no input and the
  chrome hides on start; pause freezes the position; rapid toggle spam
  leaves no stray timers; manual ArrowDown keeps playback going; popup
  pauses and Esc resumes; page end flows into the next page automatically;
  space toggles; long-press cycles speed with the transient "1.25×" label
  and persists across reload; screenshot). Whole existing suite green —
  incl. the space-key behavior change (no spec used space to step).
- **Screenshot**: `screenshots/autoscroll-phone.png` — chrome revealed,
  ▶ beside ? above the « ‹ › » nav (eyeballed).
- `npx tsc -b` clean; `npm run build` green. (One mid-run failure was a
  stale `dist` — rebuilt, then green; the rapid-toggle test needed a
  re-reveal between taps because playing hides the chrome, by design.)
- Honest gaps: no physical device — the real finger long-press feel and
  the 500ms threshold on touch are unverified; pace numbers are a calm
  guess (900ms + 340ms/word), not measured against real reading.
