# Lyric Reader — Autonomous Build Plan (Oct 18, 2026)

Nahom's conditions: PWA route. He sends a rough layout first — **do not start before it arrives.** Then he goes to bed; Muse builds with **zero interference**: no questions, no check-ins, no messages overnight. He is a UI/UX nerd — *feelings and tests* are the priority, not feature count.

## Ground rules

- His rough layout is the source of truth. Follow it literally first, polish second. Never "improve" the core interaction on my own.
- Every choice he didn't specify gets decided by me, written into `DECISIONS.md` as I go, in veto-able form (choice + why + what to say to change it).
- A blocker parks that piece with a note — it never stops the rest of the build and never wakes him.
- Nothing leaves this machine: no deploy, no publish, no accounts, no spending. Local build only.

## Build order

1. **Freeze the layout** — translate his sketch into a component map + design tokens (type scale, spacing, colours, muted-trail opacity steps). Deviations from the sketch: none without a DECISIONS.md entry.
2. **Skeleton** — Vite + React + TypeScript PWA: manifest, service worker (offline), installable on Android Chrome + laptop Chrome/Edge, IndexedDB for library + reading position.
3. **Extraction pipeline** — PDF.js (PDF), EPUB parser, TXT + paste-text. Structure parser keeps headings, paragraphs, bullets + nesting level. Sentence splitter via `Intl.Segmenter` + fixes for abbreviations, decimals, figure refs (Dr., e.g., 3.14, Fig. 2).
4. **The reader — most of the time goes here (the feel):**
   - Snap scroll, one sentence per gesture (swipe / wheel / tap zones / arrow keys) — the scroll must never fight the thumb.
   - Current sentence: bright + slightly larger; transition ~250–350ms ease so focus *glides*, not jumps.
   - Passed sentences: muted, fading further the further up they are; still readable if he glances back.
   - Page end: stack clears with a soft fade; scroll back restores the previous page's stack exactly.
   - Bullets: thin hairline connector to parent point, indent per nesting level.
   - Dark theme first (night reading), font-size control.
5. **Library + resume** — books list, last position auto-saved, progress (page x/y, %).

## Tests (run before calling it done)

- **Unit:** sentence splitter edge cases; bullet-nesting parser; page stack clear/restore state machine.
- **Extraction fixtures:** sample text-PDF, EPUB chapter, TXT — golden checks on sentence count + order.
- **Interaction (Playwright):** upload sample → scroll 10 sentences (highlight moves, trail grows) → cross a page boundary (stack clears) → scroll back (stack restored) → reload (position resumed) → offline reload (still works).
- **PWA checks:** Lighthouse installability + offline, manifest/icons, layout at phone size (~390×844) and laptop size, screenshots of every reader state.
- **Feel pass (mine, honestly reported):** read a real chapter start-to-finish in it; note where the scroll drags, where muting helps/hurts, any jank. Fix what's fixable, list the rest.

## Waiting for him when he wakes

- Installable build + how to install it on his phone.
- Screenshots of the reader states vs his layout.
- Test report — passed/failed in plain words.
- `DECISIONS.md` — every judgement call, ready for his veto.
- Known limits list (scanned PDFs / formula-heavy pages stay v2).
