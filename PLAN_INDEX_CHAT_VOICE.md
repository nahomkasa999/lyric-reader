# Plan — indexing, answer quality, and the read-aloud race

Status: proposal. No app code has been changed yet.

Three problems, three different layers:

1. **Indexing** — why it can look like nothing is being indexed, and what to do about embeddings.
2. **The assistant answers with citations only** — prompt, retrieval, and the model's token budget.
3. **The voice race** — the same sentence is spoken twice and the reader jumps ahead.

The short version:

- Do **not** use a local LLM for embeddings. A local *embedding model* is an option, but it is not the first fix. The current Gemini model is good; the index pipeline and the search are what need work.
- The citation-only answers come from the prompt asking for quotes, retrieval feeding weak passages, and possibly the thinking model eating the whole 1500-token budget.
- The voice race is confirmed. The reader hook rebuilds its callbacks on every render, so the "speak the current sentence" effect fires after every render; stale plays also still call `advance()`, which is why it skips ahead.

---

## 1. Indexing

### What the app does today

- On import, `startIndexing(book)` cuts the book into passages locally (`lib/chunks.ts`, `lib/passages.ts`) and writes them to IndexedDB immediately.
- A job row is written to `indexJobs` (`lib/indexJobs.ts`), and `kickIndexer()` (`lib/indexBook.ts`) embeds the passages in batches with `gemini-embedding-001` at 768 dimensions (`lib/embeddings.ts`).
- Search (`lib/retrieval.ts`) is hybrid: 75% cosine over the vectors, 25% keyword overlap. A book without vectors is still searchable by keyword.

That design is sound. The problems are in the details.

### Why it can look like "not indexing"

1. **Old books never get a job.**
   `startIndexing` is only called on import (`Library.tsx:101`, sample seed `App.tsx:106`). App start only calls `kickIndexer()` (`App.tsx:66-69`), which runs jobs that already exist. A book imported before v4.13 has no job row and is never queued until the user re-imports it.

2. **The progress strip can be empty even when jobs exist.**
   `useAssistantLibrary` subscribes to `onIndexProgress` after mount, but `refreshAll()` runs once at app start, before the sheet opens (`App.tsx:67`). Progress events published before the subscription are not replayed. `indexProgressOf()` exists but is never used. So a job that is `failed` or `pending` can be invisible.

3. **A failed vector write is swallowed.**
   `runJob` does `await appendVectors(...).catch(() => {})` and then advances `job.embedded` (`indexBook.ts:335-337`). If IndexedDB is full or the write fails, those passages are marked embedded but have no vectors forever.

4. **Vector IDs are passage ordinals, not passage IDs.**
   Chunks are `${bookId}:${n}` by chunk order (`chunks.ts:59`), but vectors are `${bookId}:${from + i}` by array position (`vectorStore.ts:179-181`). They line up only while the chunk list never changes. Delete a passage, re-chunk, or resegment a book and vectors attach to the wrong passages.

5. **A book can be resegmented without its index being rebuilt.**
   `getBook` resegments stored paragraph items on open (`db.ts:91-99`), but `ensurePassages` returns the existing chunks if there are any (`passages.ts:87-93`). The chunk text and its `from`/`to` item indexes are now stale. This also breaks the no-spoiler filter, because `from` no longer matches the reader's position.

6. **The embedded text has no context.**
   Only the raw passage text is embedded. The book title and heading are stored separately and never sent to the embedding model. A passage saying "He agreed" is much harder to find than "Chapter 3 › The Crash — He agreed".

7. **The keyword lane throws words away.**
   `wordsOf` keeps at most 60 distinct words per passage (`vectorScore.ts:23-31`). An 800-character passage can have more than that, so the end of the passage is invisible to keyword search. There is also no IDF/BM25 weighting.

8. **Free-tier quota looks like a hang.**
   Each passage in a batch counts against the free-tier quota. `EMBED_BATCH = 40` (`indexPlan.ts:11`) is aggressive. A 500-passage book can exhaust the daily quota; the queue then retries every few minutes forever, and the UI says "Indexing…" or shows a rate-limit message. It never distinguishes "wait a minute" from "wait until tomorrow".

9. **OpenRouter-only users cannot index or ask.**
   `canRun()` requires a Gemini key (`indexBook.ts:115-117`), embeddings only use Gemini, and `useAnswers` refuses to send without a Gemini key even if an OpenRouter key exists (`useAnswers.ts:71-77`), so the OpenRouter fallback in `aiStream` is unreachable from chat.

### Should we use a local LLM for embeddings?

No. Two different things are being mixed:

- A **local LLM** generates text. It is large, slow on a phone, and does not produce embeddings for retrieval.
- A **local embedding model** (a small encoder) does produce vectors. That is the only local option that makes sense here.

Recommendation, in order:

| Option | Quality | Cost | Offline | Verdict |
|---|---|---|---|---|
| Gemini `gemini-embedding-001`, 768d | Best | Free tier, quota | No | **Keep as primary** |
| Remote embedding API (OpenAI/Cohere/etc.) | Good | Paid | No | Only if Gemini is unavailable |
| On-device embedding via `transformers.js` | Lower | Free | Yes | Optional fallback later |
| Keyword/BM25 only | Weaker on paraphrase | Free | Yes | Must always work |

If you do want on-device embeddings later:

- Use a small multilingual model, e.g. `Xenova/multilingual-e5-small` (~120 MB) or `Xenova/all-MiniLM-L6-v2` (~23 MB, English).
- Run it in a Web Worker, in batches, with progress; never block the reader.
- Store the model ID and dimension in the index metadata. **Vectors from different models must never be mixed.**
- Treat it as a fallback, not a replacement: it will be slower per passage on a budget phone and less accurate than Gemini.
- Keep the existing keyword lane as the final fallback.

The real quality wins are chunking, context in the embedded text, BM25, and result filtering — not swapping the embedding model.

### Fix plan

#### P0 — make the index trustworthy

1. **Reconcile the whole library at startup.**
   Add `reconcileLibrary()`: for every book, ensure passages exist, ensure a job row exists, then kick the queue. Call it from `App.tsx` instead of only `kickIndexer()`. This fixes old books and books whose job was lost.

2. **Version the index per book.**
   Add an `indexMeta` record (or fields on the job): `chunkerVersion`, `embedModel`, `embedDim`, `itemCount`, `contentHash`. On open/import, if any differ, delete chunks + vectors for that book and rebuild. This fixes resegmentation and model changes.

3. **Bind vectors to chunk IDs, not positions.**
   Change `appendVectors(bookId, from, vectors)` to `appendVectors(ids: string[], vectors)`. In `runJob`, pass `ready.slice(from, to).map(p => p.id)`. Then a vector always belongs to its passage.

4. **Never mark work done when the write failed.**
   Await `appendVectors` without swallowing the error. If it fails, keep `job.embedded` where it was, set a clear error ("Storage is full — free some space and retry"), and stop the batch.

5. **Fix the progress UI.**
   On `useAssistantLibrary` mount, call `refreshAll()` or seed state from `indexProgressOf(bookId)`. Add an index status row in Settings: passages, embedded, job state, last error, and a **Rebuild index** button. `indexLibraryNow` already exists but is not exposed anywhere.

#### P1 — make retrieval good

6. **Embed context, not just text.**
   Embed `` `${bookTitle} › ${heading}\n${text}` `` while storing the original `text` for the prompt and sources. Bump `chunkerVersion` so existing books rebuild.

7. **Replace the weighted sum with BM25 + reciprocal rank fusion.**
   Store per-passage term frequencies (or compute BM25 at query time) instead of a 60-word set. Rank the keyword lane and the vector lane independently, then combine with RRF: `1/(60+rank_semantic) + 1/(60+rank_lexical)`. RRF is much less sensitive to the two scores having different scales.

8. **Threshold, dedupe, and diversify.**
   Do not return eight passages just because they scored above zero.
   - Keep hits above an absolute floor and above a fraction of the top hit.
   - Drop near-duplicates (overlapping chunks repeat their last sentence by design).
   - Apply MMR (λ ≈ 0.7) to keep different passages instead of five neighbouring ones.
   - Return 4–6 passages, and expand a hit with its neighbours only when more context is needed.
   - Use `chunk.to <= maxItem` for the no-spoiler boundary, not `chunk.from`; a chunk that starts before the reader but ends after them currently leaks later text.

9. **Handle quota honestly.**
   Reduce the default batch to 16, honour `Retry-After`, add jitter, and distinguish per-minute from per-day exhaustion. On a daily limit, pause until the window resets and say so: "Google's daily embedding limit is used up — the index continues tomorrow. Keyword search still works." Do not hammer the API every five minutes.

10. **Support OpenRouter-only users.**
    Either make the chat key check provider-aware, or state clearly that embeddings require a Gemini key and run keyword-only search otherwise.

#### P2 — optional

11. On-device embeddings as an explicit "On this device" option, with rebuild-on-switch.
12. Index the reader's notes, highlights, and saved words as a separate source kind (`note`), so the assistant can answer "what did I note about…". They are not indexed at all today.
13. A reranker (local cross-encoder or a cheap LLM pass) over the top 20 candidates, only when the top score is ambiguous.

### Acceptance tests

- A book imported before the queue existed gets chunks and a job on the next app start.
- Resegmenting a book (or changing chunk size/model) rebuilds its chunks and vectors.
- `vectors.length === chunks.length` for every indexed book.
- Killing the tab mid-index resumes at the right passage.
- A failed IndexedDB write leaves `embedded` unchanged and surfaces an error.
- With no key, keyword search still answers.
- A 500-passage book completes without a 429 storm; a daily quota produces a clear paused state.
- Vectors from two different embedding models are never mixed.

---

## 2. Why the AI answers with citations only

### Root causes

1. **The prompt asks for quotes, not answers.**
   `ASSISTANT_SYSTEM` (`assistantContext.ts:19-25`) says "Use nothing else", "say plainly that the library does not say", and "When you rely on a passage, quote its exact words in « »". There is no instruction to answer directly first or to explain in the model's own words. A model given passages and that instruction will often return the passage in quotes. The old `ASK_SYSTEM` (`askContext.ts:22-26`) has the same wording, so this style has been reinforced across versions.

2. **Retrieval always returns eight passages.**
   `rankPassages` keeps every chunk with `base > 0` and slices to `topK = 8` (`retrieval.ts:66,86,94`). One shared common word gives a non-zero lexical score, so weak and irrelevant passages are sent to the model. The model then quotes them because it has nothing better to say.

3. **Sources are attached whether used or not.**
   `answerQuestion` returns the top six hits as sources (`answerQuestion.ts:88-95`), regardless of what the model cited. Under a quote-heavy answer the UI looks like a list of citations even when the answer added nothing.

4. **The thinking model may be eating the answer budget.**
   `maxTokens: 1500` (`answerQuestion.ts:83`) covers both thoughts and visible text on Gemini 2.5/3.x. `geminiStream` correctly skips `part.thought` (`geminiStream.ts:111-112`) but never looks at `finishReason`. If thinking consumes the budget, `out` is empty, `useAnswers` still commits an empty AI message with sources (`useAnswers.ts:107-120`), and the sheet shows only the Sources strip. That looks exactly like "the AI responds with just citations".

5. **Follow-up questions are embedded alone.**
   `answerQuestion` embeds `req.question` with no history. "And why?" retrieves nothing useful. The prompt includes history, but the search does not.

6. **OpenRouter-only users are blocked before the fallback.**
   `useAnswers` requires `getEffectiveApiKey()` (Gemini). A user who configured only OpenRouter gets "Add a Gemini key" instead of an answer.

### Fix plan

#### Answer-first prompt

Replace `ASSISTANT_SYSTEM` with something like:

```text
You are the reader's assistant for the book they are reading. The PASSAGES
below are the only evidence you may use.

Write an answer, not a list of quotes:
1. Start with a direct answer in one or two sentences.
2. Then explain it in your own words: connect the facts, give the reason,
   and define anything the reader might not know. You may summarise and
   combine passages.
3. Cite the passages you used as [1], [2] at the end of the sentence.
4. Quote only when the exact wording matters, at most one short phrase
   (under 25 words), in « ».
5. If the passages do not contain the answer, say "This book doesn't say"
   in one sentence and name what the nearby passages do say. Never invent
   and never pad the answer with quotations.
6. Do not repeat the question. Keep the answer under 200 words unless the
   reader asks for more.
7. Never reveal anything after the reader's current page.
```

Passage blocks should keep their numbers so `[1]` is meaningful:

```text
[1] Book › Chapter 3 (p.42)
...text...
```

#### Retrieval

- RRF, threshold, dedupe, and MMR as described in section 1.
- For a follow-up, rewrite the search query from the last question plus the new one, e.g. `lastQuestion + " — " + question`, or ask a small model to rewrite it. Keep the original question for the prompt.
- If no passage clears the threshold, skip the model call and return a deterministic "I couldn't find that in this book." That saves quota and avoids a hallucinated quote.

#### Token budget and thinking

- Raise `maxTokens` to ~2500–3000.
- For 2.5 Flash, set `thinkingConfig.thinkingBudget = 0` for the assistant answer (or a small budget); for 3.x, use the equivalent low thinking level if the API exposes it.
- Add `finishReason` to the stream frame and throw a clear error on `MAX_TOKENS`, `SAFETY`, or `RECITATION` when there is no visible text.
- In `useAnswers`, never commit an empty answer. If `result.text.trim()` is empty, show an error and keep the question; do not render an empty bubble with sources.
- Add a quote-only guard: if the answer, after removing quotes and punctuation, is empty, retry once with "answer in your own words" at low temperature, or show the passage with an explicit "the model returned only a quotation" message.

#### Sources

- Parse `[n]` citations from the answer and map them back to hits. Show only those sources.
- If the model cites nothing, show at most the top two above-threshold hits, or no sources at all.
- Do not label the strip "Sources · 6" when six passages were merely retrieved.

#### Answer UX

- While streaming, show the answer text as it arrives; keep the three-dot state only before the first visible token.
- If the request ends with no text, replace the dots with a retry action.

### Acceptance tests

- "Why did X do Y?" returns a direct answer plus explanation and `[1]` citations, not a bare quote.
- A follow-up "and why?" retrieves the same topic.
- An answer that is empty or only a quotation is never saved as a normal message.
- The sources shown are the ones the answer cites.
- A question whose answer is after the reader's page gets "that comes later", with no leaked text.
- The prompt stays bounded (last 10 messages + digest) and does not grow with the thread.

---

## 3. The voice race

### What I reproduced

A temporary test mounted `useReaderVoice` the way `Reader.tsx` does, with the same kind of callbacks, and spoke five parts. It produced:

```text
One., One., Two., Two.
```

instead of `One., Two., Three., Four., Five.` The test has been deleted; the behaviour is in the current code.

### Exact mechanism

1. `useReaderVoice` defines `currentText`, `nextText`, `blocked`, and `advance` with `useCallback(..., [opts])` (`useReaderVoice.ts:69-102`). `opts` is an object literal created on every `Reader` render, so all four callbacks get a new identity on every render.
2. Those callbacks flow into `useReadAloud`, so `readCurrent` gets a new identity on every render (`useReadAloud.ts:231-245`).
3. The position effect depends on `readCurrent` (`useReadAloud.ts:265-270`). It therefore runs after **every** render, including the render caused by `setSpeaking(true)`. It calls `readCurrent()` again for the same sentence.
4. `toggle()` also calls `readCurrent()` directly (`useReadAloud.ts:247-256`). The effect then calls it a second time for the same position. Two readers start.
5. `play` increments `token` and the newer play supersedes the older one (`useReadAloud.ts:179-225`). But `readCurrent` does not check the token after `await spoken`; it calls `advance()` (`useReadAloud.ts:241-244`). So a play that was superseded still moves the reader forward. With a slow ElevenLabs fetch this skips sentences; with the system voice it repeats them.
6. `playAudio` calls `stopAudio()` before starting (`audio.ts:38-55`), so a stale play can also cut off the sentence that is actually being spoken.
7. `speakSystem` cannot be cancelled cleanly: `stopSpeech` bumps the generation (`speech.ts:186-197`), but `speak` only resolves when `gen === generation` (`speech.ts:221-229`). After a cancel, the promise can stay pending forever, leaving a stale `readCurrent` alive.
8. Overlays call `voice.stop()` (`Reader.tsx:202, 380, 534`), which sets `sessionRef.current = false` (`useReadAloud.ts:136-143`). That kills the session rather than pausing it. On close, `resume()` returns early when `follow` is false, or starts the sentence again when it is true (`useReadAloud.ts:258-263`). Repeated open/close of a selection or card can therefore loop the same sentence.
9. Auto-scroll and the voice are two independent drivers. The auto timer checks `voiceBusyRef` and returns without re-arming (`useReaderAutoScroll.ts:98-101`), while its effect re-arms on every render because `arm` also depends on the unstable `opts` (`useReaderAutoScroll.ts:80-110, 185-187`). There is a window where both can step the position.

### Fix plan

#### 1. Stable callbacks

In `useReaderVoice` and `useReaderAutoScroll`, keep a ref to the latest options:

```ts
const optsRef = useRef(opts);
optsRef.current = opts;

const currentText = useCallback(
  () => {
    const { item, part } = optsRef.current.posRef.current;
    return optsRef.current.partsRef.current[item]?.[part] ?? "";
  },
  [],
);
```

Do the same for `nextText`, `blocked`, `advance`, `arm`, and the other callbacks. Their identities must not change when the reader re-renders.

#### 2. One owner of the position

Make the voice the only thing that advances while a session runs:

- Starting a voice session calls `auto.stopHard()`.
- Starting auto-scroll calls `voice.stop()`.
- The auto timer is not armed at all while `voice.session` is true; it is not merely skipped inside the callback.
- Remove `voiceBusy` from the auto effect dependencies once mutual exclusion is enforced. Keep it only as a defensive check.

#### 3. A single session runner instead of an effect per render

Replace the start/effect/resume tangle with a state machine:

```ts
// idle | reading | paused | stopped
const runId = useRef(0);
const reading = useRef(false);
const session = useRef(false);

const runSession = useCallback(async (mine: number) => {
  while (session.current && mine === runId.current) {
    if (blocked()) {
      paused.current = true;
      return;
    }
    const text = currentText().trim();
    if (!text) {
      stop();
      return;
    }
    reading.current = true;
    setSpeaking(true);
    await play(text, mine);        // play checks `mine` internally
    reading.current = false;
    setSpeaking(false);
    if (mine !== runId.current || !session.current) return;
    if (!advance()) {
      stop();
      return;
    }
  }
}, [/* stable callbacks only */]);
```

Rules:

- `toggle()` starts a session exactly once: `session.current = true; runId.current += 1; void runSession(runId.current)`.
- The position effect never calls `runSession` while it is already reading the same key. Track `lastStartedKey` and `reading.current`.
- Manual navigation during a session cancels the current run (`runId.current += 1`), then starts a new runner at the new position.
- `play(text, mine)` checks `mine === runId.current` after **every** await (`fetchAudio`, `playAudio`, `speakSystem`) and returns `false` if superseded. Only `true` may lead to `advance()`.
- `setSpeaking(false)` only when `mine === runId.current`.

#### 4. Separate pause from stop

- `stop()` — the reader left, the book ended, or the speaker was pressed again. Clears the session.
- `pause()` — an overlay opened. Keeps `session.current = true`, sets `paused.current = true`, cancels the current audio, and remembers the position.
- `resume()` — only if `paused.current`, and only once. It clears the flag and starts a runner at the current key. It must **not** re-read if the voice is already reading that key.

Overlay open/close handlers in `Reader.tsx` should call `pause()` / `resume()`, not `stop()` / `resume()`.

#### 5. Make cancellation resolve

In `speech.ts`, keep the active promise's `resolve` and call it from `stopSpeech()` after bumping the generation. A cancelled utterance should resolve (not hang), so stale `readCurrent` calls finish and exit on the generation check.

Similarly, ensure `playAudio` resolves when its source is stopped. If `onended` is not guaranteed after `stop()`, call the stored `resolve` from `stopAudio()`.

#### 6. Do not re-read the same sentence

Track `spokenKey` (the last sentence that finished) and `lastStartedKey`:

- Position effect: if `key === lastStartedKey`, do nothing.
- `resume()`: if `key === speakingKey`, do nothing.
- If the sentence finished and no advance happened, do not start it again automatically.

#### 7. Keep scrolling tied to the position, not to tokens

The track placement already runs on `[I, P, ...]` (`Reader.tsx:454-456`). Keep it that way; do not add a scroll per streamed word. With one position owner, each spoken sentence produces exactly one placement, so the page cannot outrun the voice.

### Regression tests to add

- **Unstable callbacks:** a harness that passes new callback identities each render must still speak each sentence once (this is the test that failed above).
- **Double start:** pressing the speaker once sends exactly one request for the current sentence.
- **Slow ElevenLabs:** with a deferred audio fetch, no sentence is skipped and `advance()` is called once per completed sentence.
- **Stale play:** resolving a superseded play must not move the position.
- **System voice cancel:** `stopSpeech()` resolves the pending `speak()` promise.
- **Overlay pause/resume:** opening a selection pauses; closing it resumes the same sentence exactly once; opening and closing twice does not loop.
- **Voice + auto:** starting the voice stops auto; starting auto stops the voice; neither can advance while the other owns the position.
- **End of book:** the last sentence stops the session with no repeat.
- **Follow toggle:** turning follow-aloud off does not make the current sentence loop.

---

## 4. Order of work

| Step | What | Why first | Effort |
|---|---|---|---|
| 1 | Voice scheduler + stable callbacks + pause/stop | Confirmed bug, small surface, biggest perceived win | 0.5–1 day |
| 2 | Index identity + rebuild detection + startup reconcile | Without this, embeddings can be silently wrong or missing | 1–2 days |
| 3 | Retrieval (BM25/RRF/threshold/MMR) + answer-first prompt | Directly fixes "citations only" | 1–2 days |
| 4 | Token budget, `finishReason`, empty-answer guard, cited sources | Prevents the empty-answer-with-sources failure | 0.5 day |
| 5 | Quota handling + index status UI + expose rebuild | Makes indexing observable and debuggable | 0.5–1 day |
| 6 | Optional local embeddings, notes indexing, reranker | Only after the above is solid | 2–4 days |

## 5. Decisions needed

1. **Provider:** is a Gemini key acceptable, or must the app work with OpenRouter only? This decides whether embeddings need a fallback at all.
2. **Offline indexing:** is on-device embedding a hard requirement, or is online indexing plus keyword search acceptable? This is the only reason to add a local model.
3. **Answer style:** how long should an answer be, and should it always cite `[n]`, or only when it quotes?
4. **Notes:** do you want your own notes/highlights/saved words indexed as sources, or only book text?
5. **A sample failure:** one question that produced a citation-only answer would confirm whether the text is empty (thinking budget) or quote-only (prompt). The saved message text in the thread answers that immediately.
