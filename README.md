# Lyric Reader

A local-first PWA that makes dense books feel like scrolling a feed.
Upload a book → text is extracted on-device → read it **one sentence at a
time, Spotify-lyrics style**: the current sentence is huge and bright, the
sentences you've passed sit above in muted grey, upcoming ones below.
Your thumb sets the pace — swipe, tap, scroll or arrow keys, one sentence
per gesture. Each page starts with a clean slate; scroll back and the
previous page returns exactly as you left it. Bullets keep a thin hairline
linking them to their parent point.

100% local: no accounts, no servers, no uploads. Works fully offline.

## Run it

```bash
cd ~/workspace/lyric-reader/app
npm install        # once
npm run build      # production build -> app/dist
npx vite preview --port 4173   # serve the build
```

Then open `http://localhost:4173` (or the machine's LAN IP, e.g.
`http://192.168.x.x:4173`, from your phone on the same Wi-Fi).

## Install it

**Android (Chrome):** open the URL → ⋮ menu → *Add to Home screen* (or
*Install app*). It installs as a standalone full-screen app and works
offline afterwards.

**Laptop (Chrome/Edge):** open the URL → install icon in the address bar →
*Install*. Same build, same offline behaviour.

## Use it

- **Library:** upload a PDF, EPUB or TXT, or paste text. A sample book
  (*Sample — The Midnight Staircase*, 60 sentences) is preloaded so you can
  try the reader instantly.
- **Reader:** the book is an item stream on a scrolling track — the
  current sentence stays centred and bright, the trail sits above in muted
  colour, the next below. Long sentences split into parts: each gesture
  moves one part, the active part stays bright while its siblings sit muted.
  Clicks are the primary input: tap the next/previous sentence to step, tap
  a muted half to activate it, double-tap the active part (or single-tap a
  short sentence) for the action card. Wheel, arrow keys and swipe work too.
  The top bar shows `← Library`, `Page [ 3 ] / 10 · 42%` (the number is
  editable right in the bar — type and hit Enter), A−/A+, a Saved button and
  a settings gear. The `« ‹ › »` page bar at the bottom hides itself; hover
  or tap near the bottom edge to bring it back.
- **Action card:** Bookmark, Highlight, Note, Copy — one card anchored at
  the sentence, rows staggering in. Opening it blurs the chrome and zooms
  the sentence slightly (the focus effect). Marks and notes are per-part and
  saved per book; note parts get a small dot.
- **Saved:** the bookmark icon (reader top bar, library header) opens your
  saved bookmarks, highlights and notes for the book — tap any entry to
  jump the reader to that exact part.
- **Settings:** the gear opens a dedicated settings page — font (Geist /
    Serif / Mono / Lexend / System), sentence sizes, text colours and
    opacity, highlight colour, with a live preview. Settings persist
    on-device.
- Your place (book + item + part) is saved on-device and restored on
  reopen — even offline.

## Architecture (brief)

```
app/src/
  lib/
    segment.ts    sentence splitter (Intl.Segmenter + abbreviation rules)
    structure.ts  plain-text -> blocks (heading/para/bullet + level)
    extract.ts    PDF (pdfjs-dist) / EPUB (jszip + OPF walker) / TXT -> BookDoc
    types.ts      item stream model, per-part stepping, his page rule
    parts.ts      splitS: long sentences -> parts (his exact algorithm)
    db.ts         IndexedDB: books, progress, per-part marks + notes
    settings.tsx  reader settings (persisted) as CSS custom properties
    sample.ts     the bundled sample book
  components/
    Library.tsx   upload / paste / book list with progress
    Reader.tsx    his track reader: items, parts, clicks, popup, page field
    Saved.tsx     saved bookmarks / highlights / notes for a book
    Settings.tsx  the settings page (font, sizes, colours, preview)
    App.tsx       shell, dark mode, sample seeding, last-book resume
```

State logic (`step`, `trailSentences`, `upcomingSentences`, `progressOf`)
is pure and unit-tested; the Reader is a thin view over it.

## Tests

```bash
npx vitest run                  # unit: 35 tests
npx playwright test              # e2e: 33 interaction + 2 screenshot suites
```

Results are recorded in [TEST_REPORT.md](TEST_REPORT.md); screenshots in
[screenshots/](screenshots/).

## Known limits (v1)

- Scanned/image PDFs need OCR — not included (shows "no readable text").
- Two-column PDF layouts may read across columns; complex tables, formulas
  and diagrams don't survive sentence flow.
- DOCX import not included (easy to add with mammoth.js — say the word).
- Touch gestures verified via pointer-event logic + Playwright; not yet tried
  on a physical phone — that's the first thing to do on install.
- No highlights, notes, TTS, streaks or sync — deliberately out of v1 scope.
