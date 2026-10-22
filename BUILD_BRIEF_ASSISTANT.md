# Build brief — v4.13 assistant (handoff for the implementing agent)

Read this whole file before writing anything. It is written so that no
assumption is necessary. If something here conflicts with your instinct,
this file wins; if it is genuinely ambiguous, stop and ask rather than
invent.

Design reference: `CHAT_DESIGN.md` (layout, drag, states, architecture).
This file is the *execution* contract: files, types, numbers, order,
checkpoints, and the rules that are not negotiable.

Repo: `github.com/nahomkasa999/lyric-reader`, branch `main`.
App root: `/workspaces/lyric-reader`, code in `app/`.

---

## A. The goal, in one paragraph

While reading, the reader asks "why did he do that?" or "I didn't get
this" — the assistant answers from the pages they have actually read, in
the context of the passage on screen, and never spoils what comes later.
After a book is imported it is chunked **locally and immediately** (no
network, no key), so keyword search always works; embeddings are added
later by a **persistent queue** when the phone is online and a key
exists. The chat itself is a draggable bottom sheet (peek ⇄ full) with a
threads drawer, streaming answers, and tappable sources. Nothing about
the existing PDF/EPUB/TXT extraction changes.

**Non-goals (do not build):** a server, accounts, cloud sync, OCR,
on-device embeddings (Transformers.js), a model picker, AI SDK, Vercel AI
Gateway (leave a clean seam, see §E6), vector-DB libraries (Voy/Orama).

---

## B. Hard rules (enforced at every checkpoint)

1. **No end-to-end tests.** Do not write Playwright tests, do not run
   them, do not modify `app/tests/e2e/**`. It is accepted that specs
   using `library-assistant-btn` or `range.fill()` become stale; note it
   in `TEST_REPORT.md` and move on.
2. **No `any`, no `unknown`, no `never`** in any code you write — not in
   annotations, generics, casts, or `as unknown as`. No `@ts-ignore`, no
   `@ts-expect-error`. For a caught error use
   `e instanceof Error ? e.message : "…"`. For JSON use a named
   interface plus `as ThatInterface` (the repo already does this). For
   abort checks use:
   ```ts
   function isAbortName(name: string): boolean { return name === "AbortError"; }
   // call: isAbortName(e instanceof Error ? e.name : "")
   ```
   Baseline today: 42 matches of `: any|<any>|as any|: unknown|<unknown>|as unknown|: never`
   in `app/src`. After this work it must be **≤ 37** (the five in
   `db.ts` ×2, `embeddings.ts` ×2, `vectorStore.ts` ×1 are removed by
   the rewrites). No new file may add a single match.
3. **No new file over 230 physical lines** (`wc -l`), comments included.
   If a file passes 230, split it — do not compress the comments to fit.
   Edits to existing files: add ≤ 30 net lines each; if more is needed,
   extract a module. Do **not** split files that are already over 230
   (`Reader.tsx` 2133, `index.css` 1463, `Settings.tsx` 655, `db.ts` 467,
   `Library.tsx` 357, `gemini.ts` 362, `VoiceSheet.tsx` 332,
   `useReadAloud.ts` 279).
4. **No new dependencies.** No `ai`, no `@ai-sdk/*`, no markdown library,
   no date library, no state library. The SSE reader, markdown subset and
   drawer are ~300 lines total, hand-written.
5. **Keys**: never log, print, commit, or include a key in an error
   message. Never touch `.env.local` (it holds a test ElevenLabs key
   ending `dff1`). Gemini/OpenRouter keys live in `localStorage`
   (`lr-gemini-key`, `lr-openrouter-key`) — keep those names.
6. **IndexedDB migrations are additive.** Bump the version, create new
   stores, never delete or restructure an existing store in a way that
   drops data.
7. **Do not change** `lib/chunks.ts` (`chunkBook`), `lib/vectorScore.ts`
   (`combinedScore` = `0.75·semantic + 0.25·lexical`, `lexicalScore`,
   `wordsOf`), paging/scroll logic, or the reader's segment healing.
   They are unit-tested and other features depend on them.
8. **Never `dangerouslySetInnerHTML`.** Assistant text renders as React
   text nodes.
9. **Typecheck budget:** `npx tsc -b` exactly **twice** — at CP-4 and at
   CP-9. Not after every file.
10. **Commit style**: match the repo (`feat: …`, `fix: …`, lowercase
    subject, body explains *why*). Commit per phase; push after CP-4 and
    after CP-9.

---

## C. Facts about the current code (verify, then rely on)

Do not guess any of these; they are true as of commit `aa725e3`.

| Thing | Where | Fact |
|---|---|---|
| App shell / views | `app/src/App.tsx` | state `view: "library" \| "reader" \| "settings" \| "saved"`; `assistant` state `{ bookId?, bookTitle? }`; renders `<AssistantSheet>` last |
| Reader position | `app/src/components/Reader.tsx` | `I` = current item index, `P` = part index; `book` is loaded via `getBook` |
| The "?" button | `components/reader/ReaderControls.tsx` | `data-testid="ask-btn"`, prop `onAsk`; currently opens `AskSheet` |
| Ask sheet | `components/AskSheet.tsx` (298 lines) | per-passage Q&A; **to be deleted** |
| Reader's ask state | `Reader.tsx` | `askOpen` (133), `askLayerRef` (161), `askOpenRef` (182), `closeAsk` (555), `closeAskRef` (561), Escape (1183), effects (1368, 1458), render (2074) |
| Assistant UI | `components/AssistantSheet.tsx` (221) | chip row, plain text answers, no drag, no streaming |
| Assistant state | `components/useAssistant.ts` (221) | non-streaming `aiGenerate`, scope chip |
| Index status | `components/useAssistantLibrary.ts` (59) | fake 1.2 s "indexing" flag; no errors |
| Library header | `components/Library.tsx` 195–214 | `library-assistant-btn` — **remove** |
| Storage | `lib/db.ts` | DB `lyric-reader`, version **4**; stores `books, progress, marks, vocab, ask, chunks, vectors, threads` |
| Passages | `lib/chunks.ts` | `Chunk { id, bookId, text, heading, page, from, to }`, `CHUNK_CHARS = 800`, ids `${bookId}:${n}` |
| Vectors | `lib/vectorStore.ts` | `StoredChunk`, `StoredVector { id, v, w }`; `putAll`, `getAll`, `allVectors` (cached), `forgetVectors`, `chunksById` |
| Search | `lib/vectorIndex.ts` | `saveIndex`, `deleteIndex`, `indexSize`, `indexedBooks`, `search`, `searchByWords`; **only reads vectors** (the bug) |
| Embeddings | `lib/embeddings.ts` | `gemini-embedding-001`, 768-dim, normalise; **posts 20 texts as parts of one `embedContent`** (the bug) |
| Indexing | `lib/indexBook.ts` | `indexBook`, `startIndexing`, `indexLabel`, `onIndexProgress`, `cancelIndexing`, `indexProgressOf` |
| Prompt | `lib/assistantContext.ts` | `ASSISTANT_SYSTEM`, `RECENT_MESSAGES = 10`, `buildAssistantPrompt(question, passages, history)` |
| Threads | `lib/assistantStore.ts` | `Thread { id, title, scope: "book"\|"library", bookId?, messages, createdAt, updatedAt }`, `makeThread`, `listThreads`, `saveThread`, `deleteThread`, `threadTitle` |
| AI routing | `lib/ai.ts` | `aiGenerate` = Gemini first, OpenRouter fallback if a key exists |
| Gemini | `lib/gemini.ts` | `geminiGenerate`, model discovery (`storedModel()`, `discoverModel`), `fetchTolerant`, `GeminiError` codes `no-key\|invalid-key\|quota\|network\|unknown` |
| OpenRouter | `lib/openrouter.ts` | OpenAI-compatible, `OPENROUTER_MODEL = "openrouter/free"`, headers `Authorization: Bearer`, `X-Title: Lyric Reader` |
| Voice | `components/reader/useReadAloud.ts` | per-sentence `speakError(e)` note (the offline spam bug) |
| Settings sliders | `components/settings/controls.tsx`, `Settings.tsx`, `reader/VoiceSheet.tsx`, `reader/YoutubePanel.tsx` | 7 native `<input type="range">` |
| Style | `app/src/index.css` | Tailwind v4; `.ask-layer/.ask-sheet/.ask-header/.ask-x` are **shared with VoiceSheet** — keep them |

Tests today: `npx vitest run` → 225 passed / 3 skipped. Known-good
baseline. Unit tests use `happy-dom` (see `tests/settings.test.ts`).

---

## D. Data contract

### D1. IndexedDB v5 — one new store

`lib/db.ts`:

```ts
const DB_VERSION = 5; // was 4
// inside onupgradeneeded, after the existing stores:
if (!db.objectStoreNames.contains("indexJobs"))
  db.createObjectStore("indexJobs", { keyPath: "bookId" });
```

No other schema change. `chunks` rows gain `w: string[]` (the passage's
distinct words). Old rows without `w` must be tolerated: compute words
from `text` on read (`wordsOf`) and heal by re-saving that chunk lazily.
`vectors` rows keep `{ id, v }`; the old `w` there is ignored.

### D2. Types (new file `app/src/lib/indexJobs.ts`, ≤ 220 lines)

```ts
export type IndexState = "pending" | "running" | "paused" | "failed" | "done";

export interface IndexJobRow {
  bookId: string;
  state: IndexState;
  /** passages embedded so far (persisted after every batch) */
  embedded: number;
  /** passages in the book */
  total: number;
  /** failed attempts, for backoff */
  attempts: number;
  lastError: string | null;
  updatedAt: number;
  /** epoch ms; 0 = eligible now */
  nextTryAt: number;
}

export interface IndexProgress {
  bookId: string;
  done: number;
  total: number;
  state: IndexState;
  error: string | null;
  /** books still waiting in the queue, this one included */
  queued: number;
}
```

`IndexProgress` replaces the old one in `lib/indexBook.ts`; keep the
exported name `IndexProgress` and the exported functions
`startIndexing(book)`, `onIndexProgress(fn)`, `indexLabel(p)`,
`indexProgressOf(id)`, `cancelIndexing(id)` so `Library.tsx` and
`useAssistantLibrary.ts` keep compiling (update their internals only).

`indexLabel(p)` copy:

```
done      → "Ready to search"
pending   → "Waiting to index"
paused    → "Paused — will resume online"
failed    → p.error ?? "Indexing failed"
running   → p.total ? `Indexing… ${Math.round(done/total*100)}%` : "Indexing…"
```

### D3. Pure helpers (testable without IndexedDB)

`app/src/lib/indexPlan.ts` (≤ 90 lines), no React, no DB:

```ts
export const EMBED_BATCH = 40;
export const MAX_ATTEMPTS = 8;

/** 30s, 2m, 5m, 15m, then 15m. */
export function backoffMs(attempts: number): number;

/** Which job to run now, or null. Skips jobs whose nextTryAt is future. */
export function pickJob(
  jobs: IndexJobRow[],
  now: number,
  canRun: boolean,
): IndexJobRow | null;

/** The slice to embed next: { from, to } (to exclusive). */
export function nextBatch(total: number, embedded: number): { from: number; to: number } | null;
```

Rules: only `pending`, `running` (stale after a reload), or `failed`
with `nextTryAt <= now` are eligible; `done` and `paused` are not.
`canRun = online && hasKey && visible`.

### D4. Storage functions

`app/src/lib/passages.ts` (≤ 130):

```ts
export async function passagesOfBook(bookId: string): Promise<StoredChunk[]>;
export async function passageCount(bookId: string): Promise<number>;
/** Delete this book's chunks, then write them with their words. Idempotent. */
export async function savePassages(bookId: string, chunks: Chunk[]): Promise<void>;
/** Chunk + store if the book has no passages yet; returns the passages. */
export async function ensurePassages(book: BookDoc): Promise<StoredChunk[]>;
export async function deletePassages(bookId: string): Promise<void>;
```

`passages.ts` writes `{ ...chunk, w: wordsOf(chunk.text) }`.

`app/src/lib/vectorStore.ts` (≤ 150, rewrite):

- `putAll<T>(store: string, rows: T[])` — generic, **no `unknown`**.
- `allChunks(): Promise<StoredChunk[]>` (cached, invalidated by `forgetChunks()`).
- `allVectors()`, `forgetVectors()`, `chunksById(ids)` — keep.
- `appendVectors(bookId: string, from: number, vectors: Float32Array[])` —
  writes rows with ids `${bookId}:${from + i}`, `{ id, v }` only.
- `vectorsOfBook(bookId: string): Promise<StoredVector[]>`.
- `deleteVectors(bookId: string): Promise<void>` — prefix scan on keys.
- `forgetAll()` — both caches; called after any write.

### D5. Queue runner (`lib/indexBook.ts` rewrite, ≤ 225)

- `startIndexing(book)` — `void ensurePassages(book)` → upsert job
  (`pending`; keep `embedded` if vectors already exist) → `kickIndexer()`.
- `kickIndexer()` — no-op unless `canRun` (online, key, visible) and no
  job is `running`; `pickJob` → `runJob`; on completion `kickIndexer()`
  again. A module-level `running` flag prevents overlap.
- `runJob(job)`:
  1. `getBook` (never bypass it — it heals segmentation); missing →
     delete the job, return.
  2. `passages = passagesOfBook || ensurePassages(book)`.
  3. `vectors = vectorsOfBook`; if `vectors.length < job.embedded`,
     `deleteVectors` and start at 0 (the index was cleared).
  4. Loop `nextBatch`: embed `passages.slice(from, to).map(p => p.text)`,
     `appendVectors`, update the job row, `publish`.
  5. `document.hidden` between batches → state `paused`, save, stop.
  6. Errors by `GeminiError` code: `network` → `paused` if
     `!navigator.onLine`, else `failed` + `nextTryAt = now + 30_000`;
     `quota` → `failed`, `attempts+1`, `nextTryAt = now +
     backoffMs(attempts)`; `invalid-key` → `failed`, `nextTryAt = 0`
     (do not auto-retry until the key changes); anything else →
     `failed`, `nextTryAt = now + 60_000`. After `MAX_ATTEMPTS`, stop
     auto-retrying (leave `failed`, user can Retry).
  7. Success → `done`, `embedded = total`.
- Listeners installed once at module load (guard `typeof window`):
  `online` → `kickIndexer()`; `offline` → pause the running job;
  `visibilitychange` → `kickIndexer()` when visible.
- Exports: `kickIndexer`, `indexLibraryNow()` (enqueue every book), `retryIndexing(bookId)` (attempts=0, nextTryAt=0, kick), `pauseIndexing()` (mark pending/running paused), `resumeIndexing()`.
- `startIndexing` must stay the single entry point used by
  `Library.tsx` and `App.tsx` (sample seed).

### D6. Embeddings fix (`lib/embeddings.ts`, ≤ 230)

- `EMBED_BATCH = 40` for documents.
- **Batch endpoint** (this is the bug fix):
  `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents`
  body:
  ```json
  {
    "requests": [
      {
        "model": "models/gemini-embedding-001",
        "content": { "parts": [{ "text": "…" }] },
        "taskType": "RETRIEVAL_DOCUMENT",
        "outputDimensionality": 768
      }
    ]
  }
  ```
  response: `{ "embeddings": [{ "values": [ … 768 … ] }] }` — one per
  request, in order.
- If `embeddings.length !== texts.length`, fall back to one
  `:embedContent` request per text (keep the existing `post` +
  `vectorsOf` logic), never a guess.
- `embedQuery` stays a single `:embedContent` with `RETRIEVAL_QUERY`.
- Normalise every vector (`normalize`), 768 dims.
- Error mapping unchanged (400/key → `invalid-key`, 429/503 → `quota`,
  network → `network`, else `unknown` with Google's message ≤ 120 chars).
- Do not send two texts inside one `content.parts`.

### D7. Retrieval (`lib/retrieval.ts`, ≤ 170)

```ts
export interface RetrieveOpts {
  /** the book on screen — boosted, and the only book the boundary applies to */
  bookId?: string;
  /** the reader's current item index (inclusive); undefined = no boundary */
  maxItem?: number;
  topK?: number; // default 8
}

/** Pure ranking, for tests. */
export function rankPassages(
  chunks: StoredChunk[],
  vectors: Map<string, Float32Array>,
  question: string,
  opts: RetrieveOpts,
): SearchHit[];

/** IO wrapper: reads all chunks/vectors, embeds nothing. */
export async function retrieve(
  question: string,
  query: Float32Array | null,
  opts: RetrieveOpts,
): Promise<SearchHit[]>;
```

Rules:
- Candidates are **all chunks** (every book), never only indexed ones.
- Semantic = `cosine(query, v)` when the chunk has a vector, else 0.
- Lexical = `lexicalScore(question, chunk.w)` for every chunk.
- Score = `combinedScore(semantic, lexical)`; add `+0.06` when
  `chunk.bookId === opts.bookId`.
- **Boundary:** when `opts.bookId` and `opts.maxItem` are set, drop
  chunks of that book with `chunk.from > opts.maxItem`. Chunks of other
  books are not filtered (they are separate books the reader added).
- Sort desc, take `topK`; return `[]` when nothing scores above 0.
- `vectorIndex.search` / `searchByWords` become thin wrappers over
  `retrieve` (keep the exports; `useAssistant` calls `retrieve`).
- `chunksById` hydrates the hits (already exists).

### D8. Prompt + recap (`lib/assistantContext.ts` ≤ 190, `lib/recap.ts` ≤ 120)

Add:

```ts
export interface ReaderContext {
  bookTitle?: string;
  page?: number;
  readUpToItem?: number;
}

export function buildAssistantPrompt(
  question: string,
  passages: Passage[],
  history: AssistantMessage[],
  ctx?: ReaderContext,
): AssistantPrompt;
```

System text (append to `ASSISTANT_SYSTEM`, do not delete the existing
paragraph):

> The reader is reading «{bookTitle}» and is on page {page}. They have
> read only up to that point. Never reveal, hint at, quote or summarise
> anything that happens later in that book. If the question needs later
> pages, say that it comes later and that you will not spoil it.

The user block gains, before the passages:

```
READER CONTEXT: reading «{bookTitle}», page {page}.
```

`lib/recap.ts`:

```ts
/** Pure: evenly sample the read range to a char budget, always keeping the last 4. */
export function sampleRecap(chunks: StoredChunk[], maxItem: number, charBudget?: number): StoredChunk[];
/** ~12 000 chars, at most 12 passages, last 4 always included. */
export async function recapReadSoFar(opts: { bookId: string; maxItem: number; key: string }): Promise<{ text: string; passages: Passage[] }>;
```

`runRecap` uses `aiGenerate` with a system prompt: "Summarise what the
reader has read so far in this book, in their language, in 6 short
bullets. Use only the passages. No spoilers past the reader's page."
No persistence in v1 (call on demand). If there is nothing read yet:
`GeminiError("unknown", "Nothing read yet — the recap starts once you read a page.")`.

---

## E. Phases — do them in this order

Each phase: write code → unit tests → checkpoint. Do not start a phase
before the previous checkpoint passes.

### Phase 1 — Always chunk, then queue (data only)

**Files:** `lib/db.ts` (+1 store, version 5, and fix its two `unknown`s),
`lib/passages.ts` (new), `lib/indexJobs.ts` (new), `lib/indexPlan.ts`
(new), `lib/indexBook.ts` (rewrite), `lib/vectorStore.ts` (rewrite),
`components/useAssistantLibrary.ts` (read real progress).

**Behaviour:**
- Import → `startIndexing(book)` → passages saved immediately, job
  `pending`; with no key or offline, nothing else happens. Reading is
  never blocked.
- App start → `kickIndexer()` once (add to `App.tsx` with `useEffect`).
- Saving a Gemini key in Settings → `kickIndexer()` (after
  `setApiKey(...)` in `Settings.tsx`, line ~108).
- Deleting a book → `deleteIndex` + `deleteJob`.

**Acceptance:**
- DevTools offline, import a TXT: `chunks` rows exist with `w`, the book
  opens and paginates, `indexJobs` has `state: "pending"`, no network
  calls.
- Online + key: job runs in batches of 40, `embedded` persists after
  each batch, ends `done`; reloading mid-run resumes at `embedded`.
- Corrupt/removed key: job ends `failed` with the real message and does
  not retry in a loop.

**Tests:** `tests/indexPlan.test.ts` — `backoffMs` sequence, `pickJob`
(ignores done/paused/future, picks oldest due, returns null when
`canRun` false), `nextBatch` (exact slices at 0, 40, 900/40).

### Phase 2 — Batch embeddings + two-lane search

**Files:** `lib/embeddings.ts`, `lib/retrieval.ts` (new),
`lib/vectorIndex.ts` (wrappers), `lib/vectorStore.ts` (append already in
phase 1).

**Acceptance (the regression that matters):**
- A book with **no vectors** is found by keyword search. This is the
  "don't lose the current pass" guarantee.
- A question at item 120 never returns that book's chunks with
  `from > 120`.
- The embedding request is `:batchEmbedContents` with exactly one
  `requests[]` entry per passage.

**Tests:** `tests/embeddings.test.ts` (extend) — URL, body shape, count
mismatch falls back to single requests; `tests/retrieval.test.ts` (new)
— unindexed keyword hit, spoiler filter, book boost, empty query.

### Phase 3 — Prompt, recap, the assistant hook

**Files:** `lib/assistantContext.ts`, `lib/recap.ts` (new),
`components/useAssistant.ts` (rewrite, ≤ 200), `lib/assistantStore.ts`
(unchanged API; `makeThread` keeps `scope`/`bookId`).

**Hook contract** (`useAssistant({ bookId?, bookTitle?, item? })`):
`threads, thread, messages, streaming, input, setInput, sending, error,
retry, stop, send, recap, newThread, selectThread, deleteThread(id),
indexed, jobs, hasKey, sources, spoilers, setSpoilers`.

- `send(q)`: key check → embed query (failure → `null`, not fatal) →
  `retrieve(q, v, { bookId, maxItem: spoilers ? undefined : item })` →
  build prompt with `ReaderContext` → save the user message **before**
  the request → stream → append the AI message with its sources.
- `spoilers` defaults to `false`; it is sticky per thread.
- `recap()` calls `recapReadSoFar` and appends an AI message with the
  sampled passages as sources.
- `retry()` re-sends the last user message; no duplicate user bubbles.

**Tests:** `tests/assistant.test.ts` (extend) — the boundary sentence is
in the system prompt; `READER CONTEXT` present; no later-page text is
included when `readUpToItem` is set; digest and 10-message cap unchanged.
`tests/recap.test.ts` (new) — sampling keeps the last 4, respects the
budget, ignores chunks after `maxItem`.

**Checkpoint unit tests only.** No `tsc` yet.

### Phase 4 — Chat shell (no streaming yet)

**Files (all new, `app/src/components/assistant/`):**
`ChatSheet.tsx` ≤ 200, `useSheetDrag.ts` ≤ 150, `Composer.tsx` ≤ 120,
`Message.tsx` ≤ 110, `Markdown.tsx` ≤ 140, `Sources.tsx` ≤ 80.
Rewrite `components/AssistantSheet.tsx` (≤ 200) as the orchestrator that
App already imports; add `app/src/chat.css` (≤ 230) and
`@import "./chat.css";` immediately after `@import "tailwindcss";` in
`index.css`.

**Drag constants (do not improvise):**

| Constant | Value |
|---|---|
| peek | `0.62 * window.innerHeight` from the bottom |
| full | `0` (top of the sheet at the safe-area top) |
| close | `window.innerHeight` |
| close threshold | 96 px below peek, or velocity > 0.5 px/ms downward |
| arm threshold | 4 px of movement before the value changes |
| snap duration | 260 ms, `cubic-bezier(0.32, 0.72, 0, 1)` |
| drag surface | the grabber + header row only (`touch-action: none`) |
| backdrop | `rgba(0,0,0, ·)`, opacity 1 → 0.35 from full to peek |

- Pointer events with `setPointerCapture`; never scroll the message list
  while dragging the grabber.
- `prefers-reduced-motion: reduce` → no transition, snap instantly.
- Focusing the composer snaps to full.
- Escape closes (handled in `ChatSheet`, which calls `onClose`).
- `role="dialog"`, `aria-modal="true"`, `aria-label="Assistant"`; grabber
  is a `<button aria-label="Expand assistant" aria-expanded>`.

**Markdown subset:** `##`, `###`, `**bold**`, `*italic*`, `` `code` ``,
`- `, `1. `, `> `, blank line. Unknown syntax renders literally.
No HTML, no links inside answers except source chips.

**Testids (exact, keep for later phases):** `assistant-layer`,
`assistant-sheet`, `assistant-grabber`, `assistant-menu`,
`assistant-new-thread`, `assistant-thread-<id>`, `assistant-drawer`,
`assistant-messages`, `assistant-question`, `assistant-answer`,
`assistant-thinking`, `assistant-sources`, `assistant-source-<n>`,
`assistant-error`, `assistant-retry`, `assistant-input`,
`assistant-send`, `assistant-stop`, `assistant-nokey`,
`assistant-to-settings`, `assistant-index-strip`,
`assistant-suggest-<n>`, `assistant-spoilers`.

**Acceptance:** opening over the reader shows peek; drag up → full; drag
down → peek; drag down again → close; a tap on the track/backdrop does
not expand by accident; the page behind does not scroll or turn pages
while the sheet is open.

**Checkpoint: `npx tsc -b` (1st time) must be clean.**

### Phase 5 — Threads drawer + states

**Files:** `assistant/ThreadDrawer.tsx` (new, ≤ 150), `ChatSheet.tsx`
(+30 lines max), `useAssistant.ts` (threads actions), `Composer.tsx`.

- Drawer slides from the left over the sheet (240 ms, same easing).
  Rows: title, relative time ("today", "yesterday", "3 days ago"),
  delete ✕ (40 pt hit area, no swipe in v1).
- New thread = **icon only**, pencil-in-square, `aria-label="New thread"`,
  testid `assistant-new-thread`. No text.
- No chip row anywhere.
- Empty thread: "Ask your library" + up to 3 suggestion chips built from
  the book's `heading` items; fallback suggestions: "What is happening?",
  "Who is this person?", "Where does this scene take place?".
- Index strip above the composer, only when jobs are not all `done`:
  - running/pending: `Indexing 42% · 2 of 5 books` + Pause
  - offline: `2 books waiting — they'll index when you're online.`
  - failed: `Indexing failed: {reason}` + Retry
- No-key card unchanged in copy: "Ask your own books anything." /
  "Add your free Gemini key to switch the assistant on." /
  "Add key in Settings".

**Tests:** none new (UI); keep unit tests green.

### Phase 6 — Streaming

**New file `lib/aiStream.ts` ≤ 220; small additions to
`lib/gemini.ts`, `lib/openrouter.ts`.**

```ts
export interface StreamOpts {
  apiKey?: string;
  system?: string;
  messages: Array<{ role: "user" | "model"; text: string }>;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken: (token: string) => void;
  fetchFn?: typeof fetch;
}
export async function aiStream(opts: StreamOpts): Promise<string>;
```

- Provider order mirrors `aiGenerate` (Gemini if a key, else OpenRouter;
  if Gemini fails **before the first token** and an OpenRouter key
  exists, replay there).
- Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`
  headers `x-goog-api-key`; body identical to `generateWithModel`
  (`contents`, `generationConfig`, `system_instruction`).
- OpenRouter: `POST https://openrouter.ai/api/v1/chat/completions` with
  `stream: true`, `Authorization: Bearer`, `X-Title: Lyric Reader`.
- SSE reader:
  - `const reader = res.body?.getReader()` (missing body → `GeminiError("unknown", "The AI sent no stream.")`).
  - `TextDecoder`, accumulate `buffer`, split on `\n\n`, keep the tail.
  - for each frame, take lines starting `data: `; `[DONE]` ends.
  - Gemini frame: `candidates[0].content.parts[].text`, skip parts with
    `thought === true`; `promptFeedback.blockReason` → `GeminiError("unknown", …)`.
  - OpenRouter frame: `choices[0].delta.content` (may be absent).
- `res.ok === false` → read JSON, map 400/key → `invalid-key`,
  429/503 → `quota`, else `unknown` — same messages as the non-stream
  path.
- Abort: never surface an error for a user stop; `useAssistant` checks
  `signal.aborted` first.
- No `ai` package.

**Acceptance:** tokens appear one by one; Stop aborts within 200 ms and
keeps the partial text with a muted "(stopped)" suffix; a 401 before the
first token falls back to OpenRouter only if a key exists.

**Tests:** `tests/aistream.test.ts` (new) — feed a fake `Response` with
a `ReadableStream` split mid-frame; assert tokens; `[DONE]`; Gemini
`thought` skipped; 429 maps to `quota`.

### Phase 7 — Wire the entry, delete the old Ask

**Files:** `App.tsx` (+15), `Reader.tsx` (net ≤ 20), `Library.tsx`
(−25), delete `components/AskSheet.tsx`, `index.css` (delete dead rules),
`useAssistant.ts` (imports).

1. **App** — assistant state becomes
   `{ bookId?: string; bookTitle?: string; item?: number }`; reader:
   `onOpenAssistant={(title, item) => setAssistant({ bookId: openBookId, bookTitle: title, item })}`;
   pass `assistantOpen={!!assistant}` to `<Reader>`;
   `<AssistantSheet>` gets `item={assistant.item}`.
2. **Reader** — replace `askOpen` with the `assistantOpen` prop:
   - delete `import AskSheet`, `const [askOpen, setAskOpen]`,
     `askLayerRef`, `closeAsk`, `closeAskRef`, the `closeAsk` dep in the
     effect at ~1368, `closeAskRef.current()` in `jumpToPart` (~1458),
     the `askLayerRef` inside the outside-press check (~1563), the
     "close ask" branch (~1603), and the render block (~2074).
   - `const assistantOpenRef = useRef(assistantOpen);
     assistantOpenRef.current = assistantOpen;` and rename every
     `askOpenRef` use to `assistantOpenRef` (480, 676, 1046, 1075, 1183,
     1247). They keep working unchanged.
   - keydown: `if (assistantOpen) return;` before the Escape branch
     (the sheet handles Escape itself).
   - `onAsk`: keep `showChrome()`, `pauseAutoTransientRef.current()`,
     `voiceRef.current?.stop()`, then
     `onOpenAssistant(book?.title ?? "", I)`.
   - `jumpToPart`: no ask close; App closes the sheet in `onJump`.
3. **Library** — delete the `library-assistant-btn` block and the
   `onOpenAssistant` prop; App stops passing it.
4. **index.css** — delete `.ask-messages`, `.ask-msg*`, `.ask-quote`,
   `.ask-muted`, `.ask-hint`, `.ask-thinking`, `.ask-error*`, `.ask-cta`,
   `.ask-nokey*`, `.ask-input*`, `.ask-send*`, `.ask-context-chip`
   **only after** `grep -rn "ask-msg\|ask-input\|ask-nokey" src` is
   empty. Keep `.ask-layer`, `.ask-sheet`, `.ask-header`, `.ask-x` and
   `.ask-btn` (VoiceSheet and the reader use them).

**Acceptance:** the "?" opens the assistant at this book + item; the
library header has no chat icon; Escape closes the sheet; the page
behind never turns while the sheet is open; tapping a source jumps the
reader and closes the sheet; closing the sheet returns to the reader
without losing position.

### Phase 8 — Sliders

**New `components/Slider.tsx` ≤ 160; edit
`components/settings/controls.tsx`, `Settings.tsx`, `VoiceSheet.tsx`,
`YoutubePanel.tsx`.**

```ts
export function trackValue(
  startValue: number, deltaX: number, width: number,
  min: number, max: number, step: number,
): number;
```

DOM: outer `div` (44 pt tall, `touch-action: none`), track 12 px, fill
indigo to `pct`, thumb 26 px white with a 2 px indigo ring.
`role="slider"`, `tabIndex={0}`, `aria-valuemin/max/now/valuetext`,
`aria-label`.

Behaviour:
- `pointerdown` arms only (records x + value); **value does not change**.
- movement > 4 px → dragging; each move recomputes `startValue +
  deltaX/width * (max-min)`, snapped to `step`.
- `pointerup` with no drag → nothing happens (this is the requested
  "accidental click" fix).
- Arrow keys ±step, Home/End, PageUp/Down ±10 step.
- Disabled: no pointer/keyboard, 40% opacity.

Replace all 7 native ranges. `SliderRow` keeps its props and testid and
renders `<Slider … />`; the value label stays outside.

**Tests:** `tests/slider.test.ts` (new) — `trackValue` math, clamping,
snapping; render + `ArrowRight` calls `onChange`. Update
`tests/settings.test.ts` (the native-setter block at ~132) to dispatch a
`keydown` on the `bg-intensity` slider instead of setting
`HTMLInputElement.value`.

### Phase 9 — Offline read-aloud + final

**New `lib/online.ts` ≤ 50; edit `useReadAloud.ts` (+25 max).**

- `isOnline()` = `navigator.onLine !== false`.
- `isNetworkError(e: Error): boolean` = `e.name === "TypeError" ||
  /fetch|network/i.test(e.message)`.
- In `play()`: keep a `forcedSystem` ref. Skip ElevenLabs when it is
  set. On a network error while offline (or a fetch `TypeError`), set it
  and `note("You're offline — the phone's voice is reading instead.")`.
  Other errors keep `speakError(e)`.
- `prefetch` is a no-op while `forcedSystem`.
- On the `online` event: clear it; if the session is running and the
  engine is ElevenLabs, `note("Back online — ElevenLabs is reading
  again.")` and re-read the current sentence.
- Clear `forcedSystem` when `key`/`engine` changes.
- `actual` returns `"system"` while forced.
- One notice per transition — the existing `note()` dedupe helps, but do
  not rely on it alone.

**Tests:** `tests/readaloud.test.ts` (extend) — `isNetworkError` and the
one-notice rule with a fake offline navigator.

---

## F. Checkpoints (the technical gate list)

Run from `app/`. Do not skip; do not add e2e.

| CP | After phase | Commands | Pass means |
|---|---|---|---|
| CP-1 | 1 | `npx vitest run tests/indexPlan.test.ts tests/assistant.test.ts` | green; manual: offline import creates chunks + a pending job |
| CP-2 | 2 | `npx vitest run tests/embeddings.test.ts tests/retrieval.test.ts` | green; unindexed book findable; boundary respected |
| CP-3 | 3 | `npx vitest run tests/assistant.test.ts tests/recap.test.ts` | green; prompt contains the boundary |
| CP-4 | 4 | `npx tsc -b` + `npx vitest run` | tsc clean, all unit tests green; manual drag test (E4) |
| CP-5 | 5 | `npx vitest run` | green; manual: drawer, icon-only new thread, states |
| CP-6 | 6 | `npx vitest run tests/aistream.test.ts` | green; manual: tokens stream, stop works |
| CP-7 | 7 | `npx vitest run` + `npx oxlint` | green; manual: "?" opens chat, no library chat icon, page frozen behind |
| CP-8 | 8 | `npx vitest run tests/slider.test.ts tests/settings.test.ts` | green; manual: tap does nothing, drag changes, thumb fat |
| CP-9 | 9 | `npx tsc -b` + `npx vitest run` + `npm run build` + `git status` | tsc clean; 3 known skips only; build OK; no key in `dist/`; `.env.local` untracked |

Additional CP-9 checks (paste results into the report):

```bash
cd app
grep -rn ": any\|<any>\|as any\|: unknown\|<unknown>\|as unknown\|: never" src | wc -l   # must be ≤ 37
for f in $(git status --porcelain | awk '$1=="??"{print $2}' | grep -E '\.(ts|tsx|css)$'); do wc -l "$f"; done  # each ≤ 230
grep -rl "sk_" dist/assets/*.js || echo "no key in the bundle"
npx vitest run 2>&1 | grep -E "Test Files|Tests "   # expect 225+ passed, 3 skipped
```

**Manual smoke script (CP-9, in `npm run dev`, phone viewport):**

1. DevTools → Offline → Add Book → paste text. Book opens, pages turn,
   `chunks` + `indexJobs` in IndexedDB, no network request.
2. Online + Gemini key. Watch the strip: `Indexing …`, then gone.
3. Open a book, turn to page 10, "?" → drag up → full, drag down → peek,
   tap the track → nothing.
4. Ask "what is happening here?" — answer arrives streaming, sources
   below, no source from a later page.
5. Tap a source → the reader opens there, sheet closed.
6. `+` → "What's happened so far?" → recap, sources = read passages.
7. Turn on "Allow spoilers", ask about the end → allowed.
8. Reload mid-index → job resumes.
9. Offline, start read-aloud → one notice, phone voice continues.
10. Settings: tap the intensity track → value unchanged; drag → changes.

---

## G. Definition of done

- All phases + checkpoints done, all manual steps observed.
- New files ≤ 230 lines; zero new `any/unknown/never`.
- `tsc -b` clean; `vitest` green (only `elevenlabs.live.test.ts`'s 3
  skips); `npm run build` OK; no key in `dist`.
- `TEST_REPORT.md` updated: what ran, what passed, e2e not run (policy),
  which e2e specs are now stale (`assistant.spec.ts`,
  `reader.spec.ts` settings slider, `youtube.spec.ts` volume).
- Commits per phase; pushed after CP-4 and CP-9 to
  `origin/main`. Never commit `.env.local` or any key.
- Final message: what changed, what was verified, what is deliberately
  deferred (AI Gateway lane, rolling recap, on-device embeddings).

---

## H. Do not assume (common wrong turns)

1. The assistant is **not** a server chat. No API routes, no server
   functions, no env secrets. `vercel.json` builds a static PWA.
2. `VITE_GEMINI_API_KEY` is a **build-time** app key; the reader's own
   key wins (`getEffectiveApiKey`). Do not touch `vite.config.ts`.
3. The ElevenLabs key is the **reader's own** and stays in Settings; it
   has nothing to do with this work.
4. The PDF→text pipeline (`lib/extract.ts`, `lib/pdfWorker.ts`) is
   untouched. Scanned PDFs with no text layer stay unextractable (no
   OCR).
5. Passages are always local; vectors are optional. Never gate search on
   vectors.
6. The boundary applies **only** to the book on screen; other books stay
   searchable.
7. The old `AskSheet` is deleted, not kept behind a flag. `ask-btn`
   remains the entry (testid unchanged).
8. The chip row is deleted, not restyled. Scope is not a visible control.
9. `AssistantSheet` remains the component App imports — do not rename it
   to `ChatSheet` at the App boundary.
10. Do not "improve" `chunkBook`, `combinedScore`, or `lexicalScore`.
11. Do not add a service-worker route; `vite-plugin-pwa` already
    precaches the app shell.
12. Do not store keys in IndexedDB; they stay in `localStorage`.
13. Do not use `navigator.onLine` as proof of reachability — treat it as
    a hint and still handle fetch failures.
14. Unit tests run in `happy-dom`; IndexedDB is not available there.
    Keep DB-touching code behind thin wrappers and test the pure helpers
    (`indexPlan`, `rankPassages`, `sampleRecap`, `trackValue`).
15. Only the app in `app/` is the product; `CHAT_DESIGN.md` and this file
    are documentation, not code.
