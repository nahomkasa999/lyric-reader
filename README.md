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
- **Reader:** swipe up/down, tap the bottom/top third, scroll the mouse
  wheel, or use arrow keys / space — each gesture moves exactly one sentence.
  Tap the **middle third** to reveal the overlay: back to library,
  `Page x of y · z%`, progress bar, and A−/A+ text size. It auto-hides.
- Your place (book + page + sentence) is saved on-device and restored on
  reopen — even offline.

## Architecture (brief)

```
app/src/
  lib/
    segment.ts    sentence splitter (Intl.Segmenter + abbreviation rules)
    structure.ts  plain-text -> blocks (heading/para/bullet + level)
    extract.ts    PDF (pdfjs-dist) / EPUB (jszip + OPF walker) / TXT -> BookDoc
    types.ts      Book/Page/Sentence model, step/trail/progress logic
    db.ts         IndexedDB: books, progress
    sample.ts     the bundled sample book
  components/
    Library.tsx   upload / paste / book list with progress
    Reader.tsx    the three-zone lyric reader + gestures + overlay
    App.tsx       shell, dark mode, sample seeding, last-book resume
```

State logic (`step`, `trailSentences`, `upcomingSentences`, `progressOf`)
is pure and unit-tested; the Reader is a thin view over it.

## Tests

```bash
npx vitest run                  # unit: 30 tests
npx playwright test              # e2e: 7 interaction + 2 screenshot suites
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
