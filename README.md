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
(One optional extra: ask the AI questions about a passage — that needs
your own free Gemini key in Settings, stored on your phone only and never
sent anywhere but Google's Gemini API.)

## Run it

```bash
cd ~/workspace/lyric-reader/app
npm install        # once
npm run build      # production build -> app/dist
npx vite preview --port 4173   # serve the build
```

Then open `http://localhost:4173` (or the machine's LAN IP, e.g.
`http://192.168.x.x:4173`, from your phone on the same Wi-Fi).

### App key (optional, v4.3)

Nahom wanted meanings and Ask to work with zero setup, so the app can
carry his key itself. Set `VITE_GEMINI_API_KEY` as a **Production**
environment variable in Vercel (project → Settings → Environment
Variables) and **redeploy** — the built bundle then includes the key and
the AI features turn on for everyone with no setup.

- Precedence: a personal key pasted in Settings → AI **always wins** over
  the app key; removing the personal key falls back to the app key.
- The key itself lives ONLY in Vercel's env vars — it must never be
  committed to this repo (Google auto-revokes keys found in public code).
- Caveat: the key ships inside the public web bundle, so it is extractable
  by anyone who downloads it and its quota is shared. Fine at this scale;
  revisit (proxy server, per-user keys) if the app spreads widely.

## Install it

**Android (Chrome):** open the URL → ⋮ menu → *Add to Home screen* (or
*Install app*). It installs as a standalone full-screen app and works
offline afterwards.

**Laptop (Chrome/Edge):** open the URL → install icon in the address bar →
*Install*. Same build, same offline behaviour.

## Use it

- **Library:** upload a PDF, EPUB or TXT, or paste text. A sample book
  (*Sample — The Midnight Staircase*, 60 sentences) is preloaded so you can
  try the reader instantly. Amharic text works too: the reader splits on
  the Ethiopic full stop ፡ (including the four-dot ending ፡፡፡፡), on ። and
  on ፧, and keeps the marks exactly as you wrote them.
- **Reader:** the book is an item stream on a scrolling track — the
  current sentence stays centred and bright, the trail sits above in muted
  colour, the next below. Long sentences split into parts: each gesture
  moves one part, the active part stays bright while its siblings sit muted.
  Clicks are the primary input: tap the next/previous sentence to step, tap
  a muted half to activate it, double-tap the active part (or single-tap a
  short sentence) for the action card. Wheel, arrow keys and swipe work too.
  The top bar shows `← Library`, `Page [ 3 ] / 10 · 42%` (the number is
  editable right in the bar — type and hit Enter), A−/A+, a Saved button and
  a settings gear. Top bar, progress hairline and the `« ‹ › »` page bar all
  auto-hide together for full-focus reading — tap or hover near the top or
  bottom edge to bring them back.
- **Action card:** Bookmark, Highlight, Note, Copy — one card anchored at
  the sentence, rows staggering in. Opening it blurs the chrome and zooms
  the sentence slightly (the focus effect). Marks and notes are per-part and
  saved per book; note parts get a small dot.
- **Saved:** the bookmark icon (reader top bar, library header) opens your
  saved bookmarks, highlights and notes for the book — tap any entry to
  jump the reader to that exact part.
- **Word meanings:** select text on the current sentence (long-press on a
  phone) to raise a small pill — **Meaning** opens a card with the
  dictionary definition, phonetic, examples, and (with a key) the AI's
  "as used in this sentence" line; **Copy** copies the text. Phrases and
  idioms are defined by the AI when a key is set. **Save word** keeps it:
  saved words get a faint dotted underline in the text and live under the
  **Words** tab next to Saved, grouped by day — tap any row to jump back
  to the sentence where you learned it.
- **Ask (?):** the circular ghost button that joins the auto-hiding chrome
  opens a chat sheet about the passage you're reading — it sends the
  previous, current and next page (your current sentence marked, plus the
  section heading) to Gemini and answers only from that text. Quoted
  sentences in an answer are tappable: tap one and the reader jumps to it.
  Bring your own free Gemini key (Settings → AI) — plain-word definitions
  always work keyless via the free dictionary API.
- **Auto-scroll:** a ▶/❚❚ ghost button beside the "?", in the same
  auto-hiding chrome cluster. Tap to play/pause (Space works too); it
  advances part by part at a reading pace computed per part
  (900ms + 340ms/word), flows across page ends, and stops at the book's
  end. Long-press the button to cycle speed 1× → 1.25× → 1.5× → 0.75×
  (persisted). Opening the popup, a selection, or the Ask sheet pauses it
  and closing resumes; Settings/leaving/tab-switch stops it.
- **Read aloud:** the speaker button in the reader starts a reading
    session — the book reads itself, sentence by sentence, and the page
    turns as it goes. The voice comes from **ElevenLabs**, so the phone
    only downloads the sound: nothing heavy runs on it, which is what a
    budget phone needs. The app ships with a key of its own (shared
    quota); in Settings you can paste **your own** ElevenLabs key — it
    stays on your phone and is sent only to ElevenLabs.
  - **Choosing the voice:** tap the speaker to read, **hold** it to open
    the voice picker (or ⋯ → Voice in the top bar). The picker lists your
    account's voices — the library plus anything you cloned — each with a
    ▶ to audition, the way ChatGPT lets you audition one. The phone's own
    voices are listed too (pick *Use this phone*), because the browser's
    default voice is nobody's choice.
  - The voice that is picked is the voice that reads: a new pick is
    fetched again, never served from the last one's audio. If ElevenLabs
    cannot read (no key, no quota, missing permission), the reader says
    so in a small note instead of quietly swapping in another voice.
  - With no key, or if you pick the phone's own voice, the browser's
    speech engine reads instead.
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
    db.ts         IndexedDB: books, progress, per-part marks + notes, vocab, ask threads
    settings.tsx  reader settings (persisted) as CSS custom properties
    sample.ts     the bundled sample book
    apikey.ts     Gemini key in localStorage (never logged, never shipped)
    gemini.ts     Gemini 2.5 Flash client (chat + JSON mode, calm errors)
    meaning.ts    dictionary lookup + lemmatizer retry + Gemini phrase/in-context
    askContext.ts passage context builder + «quote» matching for the Ask sheet
    vocab.ts      day grouping + saved-word text decoration
    speech.ts     the browser's speech engine (the fallback voice)
    elevenlabs.ts the ElevenLabs client: key, voices, text-to-speech
  components/
    AskSheet.tsx  bottom-sheet Q&A about the passage (thread per book)
    Words.tsx     saved words grouped by day, tap-to-jump, delete
  components/
    Library.tsx   upload / paste / book list with progress
    Reader.tsx    his track reader: items, parts, clicks, popup, page field
    Saved.tsx     saved bookmarks / highlights / notes for a book
    Settings.tsx  the settings page (font, sizes, colours, preview)
    reader/       the reader's parts: TopBar, ReaderControls, VoiceSheet
    settings/     the settings groups (controls, Read aloud)

Read aloud needs a key: put it in `.env.local` at the repo root as
`ELEVENLABS_API_KEY=…` (gitignored, never in the code) — the build
reads it and hands it to the app as the shared key. Each user can still
paste their own key in Settings.
    App.tsx       shell, dark mode, sample seeding, last-book resume
```

State logic (`step`, `trailSentences`, `upcomingSentences`, `progressOf`)
is pure and unit-tested; the Reader is a thin view over it.

## Tests

```bash
npx vitest run                  # unit: 206 tests
npx playwright test              # e2e: 34 interaction + 2 screenshot suites
```

The ElevenLabs tests that talk to the real API are skipped unless a key
is given:

```bash
ELEVENLABS_API_KEY=sk_… npx vitest run tests/elevenlabs.live.test.ts
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
