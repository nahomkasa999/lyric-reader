# The assistant — chat design (v4.13)

Status: **design for approval**. No code yet.

Reference: the two ChatGPT screenshots (Nahom, Oct 21). We copy the
*structure* — menu left, compose right, right-aligned user bubble, plain
full-width answer, floating composer pill — and none of the light theme.
Dark Glass stays: pure black, one glass surface, indigo when something acts.

---

## 1. What the sheet is

A bottom sheet over the reader (or Home). Two resting sizes:

```
peek   ≈ 62dvh   the reading page is still visible behind it
full   = 100dvh  the page is gone; the conversation owns the screen
```

It opens at **peek**. Drag the handle up → full. Drag down → peek, then
closed. The conversation scrolls inside the sheet; the handle never
scrolls with it.

## 2. Layout — peek

```
┌──────────────────────────────────────┐
│              ▬▬▬▬                    │ ← grabber, 36×5, 44pt hit area
│  ☰                            ▣      │ ← threads · new thread
│                                      │
│                  ╭─────────────────╮ │
│                  │ Help me create  │ │ ← user: bubble, right
│                  │ a café mocha    │ │   #1D1D20, radius 20
│                  ╰─────────────────╯ │
│                                      │
│  A good café mocha is all about      │ ← assistant: no bubble,
│  balancing three things: rich        │   full width, 15.5/24
│  espresso, smooth chocolate, and     │
│  creamy milk.                        │
│                                      │
│  ☕ Classic Café Mocha               │ ← h2 17/600
│                                      │
│  • 1 shot espresso                   │ ← lists, 18px indent
│  • 200 ml milk                       │
│                                      │
│  ──────────────────────────────────  │ ← hairline, white/8
│  SOURCES · 2                         │ ← 11px uppercase, muted
│  [📖 The Book · p.42]  [p.43]        │ ← chips, tap = jump there
│                                      │
│  ╭────────────────────────────────╮  │
│  │ +   Ask your library…       ↗ │  │ ← composer pill, 52pt
│  ╰────────────────────────────────╯  │
└──────────────────────────────────────┘
```

**Full** is the same column, just taller — the sheet top reaches the
safe area, the header gains the word *Assistant*, and the message list
gets the extra room. Nothing else moves.

## 3. The drag (the "dash thing")

- **Handle** — 36×5 pill, white/25, radius full, centered, 8px above the
  header. Hit area 44pt tall, full width. The header row drags too, so
  you don't have to find the dash.
- **Gesture** — `pointerdown` captures; the sheet follows the finger 1:1
  (translateY). Backdrop opacity interpolates (0.35 at peek → 1 at full).
- **Release** — velocity first (≥ 0.5 px/ms goes the way you flicked),
  otherwise the nearest snap. Peek → full is reachable by a short flick;
  dragging down from peek past 96px closes.
- **Rubber band** — above full or below peek it resists at 0.25×.
- **Keyboard** — focusing the input always snaps to full (otherwise the
  composer sits under the keyboard). `visualViewport` insets the sheet.
- **Motion** — 260ms `cubic-bezier(0.32, 0.72, 0, 1)`; reduced motion
  jumps instantly. No animation on the message list.
- **Backdrop** — tap closes; it never blocks reading behind at peek (it is
  a gradient, not a wall).

## 4. Header

| Slot | Control | Action |
|---|---|---|
| left | ☰ (three lines) | opens the **threads drawer** |
| right | ▣ pencil-in-square | **new thread** — icon only, no label |
| right (optional) | ⋯ | overflow: *Index my library*, *Clear all threads* |

The old horizontal chip row ("+ New thread", thread chips, "This book")
is **gone** — it was the part that felt bad. Threads live in the drawer.

### Threads drawer

Slides in from the left over the sheet: 300ms, same easing. Rows:
title (first question, one line, ellipsised), relative time, and a tiny
scope tag (`Book` / `Library`). Swipe left to delete, with undo for 5s.
"Clear all" at the bottom, muted. Empty state: "No conversations yet —
ask something."

## 5. Messages

**User** — right-aligned bubble, max 82% width, fill `#1D1D20`, 1px
white/6 border, radius 20 (4 on the bottom-right), padding 12×16, 15px.
No avatar, no name.

**Assistant** — no bubble, full width, 15.5px / 1.62, white 92%,
padding 2px 0. Rendered from a small markdown subset: paragraphs, **bold**,
*italic*, `code`, h2/h3, bullet and numbered lists, blockquotes.
A paragraph gap of 14px, list gap 8px. Line length is bounded by the
phone, so no max-width juggling.

**Sources** — a hairline divider, the label `SOURCES · n`, then chips:
book icon + title · p.N. Max 3 chips + "+n"; a chip tapped opens the
reader at that item and closes the sheet. Sources are part of the answer,
always below it — never floating above the text.

**Thinking** — three 5px dots, left-aligned, pulsing 1.2s, replacing the
text cursor. Not an "…" bubble.

**Streaming** — tokens append live; the caret is a 2px indigo bar. The
list follows the stream **unless** the reader has scrolled up, in which
case a "Jump to latest ↓" pill appears above the composer.

**Error** — one inline row under the last message: muted red icon, the
actual reason, a `Retry` chip. Never a red wall, never a toast per
request.

## 6. Composer

- Pill, 52pt, glass (white 6%, white 12% border), radius full, 6px inset.
- `+` on the left (34pt) → small action sheet:
  *Use the passage on screen* · *Index my library* · *Clear this thread*.
- Textarea: 15px, auto-grows 1→5 lines, placeholder "Ask your library…",
  Enter sends, Shift+Enter breaks.
- Send: 34pt indigo circle, white arrow; disabled when empty.
  While streaming it becomes a **stop** (square) and cancels the request.
- Above the pill, a 28px strip appears only when needed:
  *Indexing 42% · 2 of 5 books* with a thin progress bar, or
  *You're offline — answers need a connection.*

## 7. States

| State | What the sheet shows |
|---|---|
| No key | Centered: "Ask your own books anything." + *Add a Gemini key* (Settings). One button, no chat chrome. |
| Empty thread | Greeting "Ask your library" + 3 suggestion chips built from the open book's headings. |
| Library not indexed | Same as empty, plus a quiet line and an *Index my library* chip. Never a blocking dialog. |
| Indexing | Progress strip above the composer; the chat stays usable (word search still answers). |
| Offline | One strip above the composer, once. Text questions still answer if a key and index exist? No — the model needs the network; say so once. |
| Error | Inline row with Retry, only for the message that failed. |

## 8. Scope — the chip is dropped

No "This book / All my books" control. It was the most confusing thing on
the sheet and the reference has nothing like it.

- The assistant always searches **the whole library**.
- The book you are reading gets a **ranking boost** (its passages win
  ties), and its title is in the prompt as "the reader is in …".
- Every answer says which book a passage came from, so scope is visible
  where it matters — on the source, not on a toggle.
- A thread keeps the book it was started from, for the prompt only.

## 9. Surface, type, motion

- Sheet: `rgba(18,18,20,0.90)`, blur 24, top radius 28, 1px white/10,
  shadow up `0 -12px 40px rgba(0,0,0,.5)`.
- Grabber white/25; hairlines white/8; text white/92; muted white/55.
- Indigo `#5B4FE9` only for: send, streaming caret, active chip, links.
- No second glass surface inside the sheet (the message area is flat) —
  keeps the 3-blur budget and the reading screen calm.
- Everything ≤ 300ms, `cubic-bezier(0.23,1,0.32,1)`, reduced-motion aware.

## 10. Architecture — what this is built on

**Local-first RAG, bring-your-own key, no backend.** The app has no
server, and adding one would break the promise ("no accounts, no
uploads"). So the model is called from the browser with the reader's own
key, and retrieval happens on the device.

```
┌─ React ─────────────────────────────────────────────────────┐
│ AssistantSheet ─ useAssistant (one state machine)            │
│   ├─ retrieve  embedQuery(question) ──────────────┐          │
│   │              └─ fallback: searchByWords       │          │
│   │                                               ▼          │
│   │                                     local vector scan    │
│   │                                     (IndexedDB, cosine)  │
│   ├─ prompt   buildAssistantPrompt(question, hits, history)  │
│   └─ stream   aiStream(opts) ──► SSE ──► tokens              │
└──────────────────────────────────────────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
      Gemini stream        OpenRouter stream     AI Gateway (opt.)
   :streamGenerateContent  /chat/completions    /v1/chat/completions
```

- **Transport**: `fetch` + SSE, read with a `ReadableStream` reader and
  an `AbortController`. Gemini uses `:streamGenerateContent?alt=sse`;
  OpenRouter and the Vercel AI Gateway share the OpenAI-compatible
  `/chat/completions` shape, so one parser serves both.
- **Fallback**: the existing chain (Gemini → OpenRouter) moves to the
  stream. It falls back only before the first token, never mid-answer.
- **AI SDK / Gateway**: the Vercel AI Gateway is supported as an
  **optional third lane** — the reader pastes their own gateway key and
  picks a `provider/model`. It is OpenAI-compatible, so it costs ~20
  lines, not a new architecture. The AI SDK itself (`ai`, `useChat`) is
  not used: `useChat` expects a server route, and the alternative (a
  custom direct transport) is more machinery than the ~80-line SSE
  reader it would replace. If we ever add a backend, that is the moment
  to adopt it — not before.
- **Retrieval**: unchanged concept, fixed maths (see §11): embeddings
  from Gemini, `RETRIEVAL_DOCUMENT` for passages, `RETRIEVAL_QUERY` for
  the question, 768-dim, normalised, hybrid with keywords.
- **Storage**: IndexedDB — `threads`, `chunks`, `vectors`. Keys in
  localStorage, one per provider. No cookies, no analytics.
- **Prompt**: only retrieved passages + the last ~10 messages + a
  digest of older ones. The answer must cite the passages it used.

## 11. What changes in the code

| File | Change |
|---|---|
| `components/AssistantSheet.tsx` | rewritten as the shell (sheet + drag + header + drawer + messages + composer) |
| `components/assistant/useSheetDrag.ts` | new: snap points, velocity, keyboard inset |
| `components/assistant/ThreadDrawer.tsx` | new |
| `components/assistant/Composer.tsx` | new |
| `components/assistant/Message.tsx` + `Markdown.tsx` | new: bubbles, markdown subset, sources |
| `components/useAssistant.ts` | streaming state, abort, retry, no scope |
| `components/useAssistantLibrary.ts` | real progress + errors, not a 1.2s timer |
| `lib/ai.ts` | `aiStream()` — Gemini SSE + OpenAI-compatible SSE, same fallback |
| `lib/gemini.ts`, `lib/openrouter.ts`, new `lib/gateway.ts` | stream endpoints |
| `lib/embeddings.ts` | **fix**: `:batchEmbedContents` (the current batch call returns one vector → one request per passage → rate limits) |
| `lib/indexBook.ts` | per-batch save, progress, retry, resume, skip already-indexed |
| `lib/vectorIndex.ts` | boost the open book's passages on ties |
| `index.css` | chat tokens (sheet, bubble, composer, drawer) |
| `Library.tsx` | remove the header chat bubble; "?" is the door |
| `ReaderControls.tsx` / `Reader.tsx` | "?" opens the assistant; `AskSheet` retired |
| `tests/` | update e2e for the new entry + batch stub |

## 12. Build order

1. Sheet + drag + header + composer + message styles (no streaming yet).
2. Threads drawer, new-thread icon, empty/no-key/indexing states.
3. Streaming + stop + retry.
4. Sources block + jump.
5. Indexing: batch endpoint, progress, retry, skip-indexed.
6. Then the earlier list: sliders, offline read-aloud, "?" entry.

Each phase is shippable on its own.
