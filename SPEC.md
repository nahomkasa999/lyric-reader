# Lyric Reader — MVP Spec (prepared Oct 18, 2026)

Nahom's idea: make dense textbooks feel like scrolling a feed, not reading a wall.

## Core interaction (the part that's his)

1. Upload a book → text is extracted locally, split into **sentences**.
2. Reader looks like Spotify lyrics:
   - **One current sentence** — bright, larger, fully focused.
   - Sentences already passed on this page stack **above it in muted/faded colour** — you can glance back without losing your place.
   - Upcoming sentences sit below, very dim.
3. **You scroll, sentence by sentence** (snap scroll: swipe / wheel / tap / arrow keys). No auto-timer — your thumb sets the pace, like doomscrolling, but it's a book.
4. **Page boundary = clean slate.** When a page ends, the accumulated muted stack clears and the next page starts fresh. Scroll back and the previous page's stack returns exactly as it was.
5. **Structure stays visible:**
   - Headings become section markers.
   - Bullets / nested points get a **thin hairline connector** on the left linking each point back to its parent (thread-line style, like Reddit/X), indent deepening with nesting level.
   - Paragraph breaks get breathing room, not a wall.
  
## Formats (v1)

| Format | Extraction | Notes |
|---|---|---|
| EPUB | epub parsing (JSZip + HTML) | Best case — real headings/bullets preserved |
| PDF (text-based) | PDF.js | Good for prose; two-column layouts can garble order |
| TXT / paste text | native | Easy fallback, also good for testing |
| DOCX | later in v1 if time | mammoth.js |
| Scanned PDF | **v2** | Needs OCR (Tesseract.js); formulas/diagrams won't survive sentence flow — honest limit for maths-heavy textbooks |

## Tech + install plan

**Build once as a local-first web app (PWA), then wrap if wanted:**

- Stack: Vite + TypeScript + React, PDF.js, IndexedDB (library + reading position), `Intl.Segmenter` for sentence splitting (with abbreviation fixes: Dr., e.g., Fig. 3.2, decimals).
- **100% local** — files never leave the device, works fully offline. That matches "local app" and avoids any server cost.
- **Install:**
  - Android: open in Chrome → "Install app" — real home-screen icon, full-screen, offline.
  - Laptop (Linux/Windows): Chrome/Edge install as app, same codebase.
  - Optional v1.5: wrap the same build with Capacitor → a real installable **APK** file, Play Store-ready later.
  - Optional later: Tauri desktop build if a native desktop app is wanted.

## MVP v1 scope (one build)

- [ ] Upload PDF / EPUB / TXT + paste-text option
- [ ] Local library (books + resume position saved on device)
- [ ] Sentence reader: snap scroll, bright current / muted trail / dim upcoming
- [ ] Page/chapter boundary clearing + scroll-back restore
- [ ] Heading markers + bullet hairline connectors with nesting
- [ ] Dark theme, font-size control, page x/y + % progress
- [ ] Keyboard (arrows/space) + touch swipe control

**Not v1:** OCR, text-to-speech, accounts/sync, highlights/notes export, streaks — all v2 candidates.

## Closest existing apps (checked Oct 18, 2026)

- **Glowread** — closest in spirit: "scroll a book instead of doomscrolling", upload PDF/EPUB/DOCX/TXT, but its reader is RSVP one-word-flash + AI narration, paid tiers ($9.99/$19.99/mo). Not manual sentence scroll.
- **ReadMe! / Spritz / Fovea / Readflow / FocusWord** — RSVP: one *word* at a time at a fixed point. Words vanish — no muted trail, no re-reading, no bullets.
- **HushBook / Spokt / Speechify** — karaoke highlighting, but driven by *audio playback* (TTS), not by your scrolling.
- **BeeLine Reader / Bionic Reading** — only recolour/bold the normal page; no sentence focus, no scroll feed.

**Gap:** nobody does manual, thumb-paced, sentence-at-a-time scrolling with a muted history trail, page resets, and structure hairlines. That's the original part.

## Open choice for Nahom

Phone-first (Android install), laptop-first, or PWA-for-both (recommended — same build, install everywhere, APK wrap later).
