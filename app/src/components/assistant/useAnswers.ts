// The questions (v4.13) — asking, asking again, and the recap.
//
// The three actions that talk to the model live together, so the hook
// that holds the state (components/useAssistant.ts) stays small: it
// owns the screen, this owns the conversation.
import { useCallback, useRef } from "react";
import { GeminiError } from "../../lib/errors";
import { getEffectiveApiKey } from "../../lib/apikey";
import { answerQuestion } from "../../lib/answerQuestion";
import { recapReadSoFar, recapSources } from "../../lib/recap";
import { makeThread, type AssistantMessage, type Source } from "../../lib/assistantStore";
import type { ThreadsState } from "./useThreads";

export interface AnswerOptions {
  /** the book on screen */
  bookId?: string;
  bookTitle?: string;
  /** the item the reader is on — the boundary of the answer */
  item?: number;
  /** may the answer reach past the reader's page? */
  spoilers: boolean;
  threads: ThreadsState;
  setError: (v: string | null) => void;
  setSending: (v: boolean) => void;
  setStreaming: (v: boolean) => void;
  setSources: (v: Source[]) => void;
  /** the text that is arriving right now */
  setLive: (v: string) => void;
}

export interface Answers {
  send: (question: string) => Promise<void>;
  retry: () => void;
  recap: () => Promise<void>;
  stop: () => void;
}

/** Why did the last request fail? */
function reasonOf(e: Error): string {
  return e instanceof GeminiError
    ? e.message
    : "Couldn't reach the AI — check your connection.";
}

/** The message that says a key is missing. */
const NO_KEY =
  "Add a Gemini key in Settings to ask your library — the answers come from your own books.";

export function useAnswers(opts: AnswerOptions): Answers {
  const { bookId, bookTitle, threads } = opts;
  const itemRef = useRef(opts.item);
  itemRef.current = opts.item;
  const spoilersRef = useRef(opts.spoilers);
  spoilersRef.current = opts.spoilers;
  // The request that is running, so the reader can stop it.
  const ctrl = useRef<AbortController | null>(null);
  // The text that has arrived so far.
  const live = useRef("");

  /** Ask the model, and write the answer into the thread. */
  const answer = useCallback(
    async (question: string, history: AssistantMessage[]) => {
      const key = getEffectiveApiKey();
      if (!key) {
        opts.setError(NO_KEY);
        opts.setSending(false);
        return;
      }
      const base =
        threads.thread ?? makeThread(bookId ? "book" : "library", bookId);
      const withUser: AssistantMessage[] = [
        ...history,
        { role: "user", text: question, at: Date.now() },
      ];
      // The question is saved BEFORE the request: a failed answer must
      // not lose what the reader asked.
      threads.commit({ ...base, messages: withUser });
      const request = new AbortController();
      ctrl.current = request;
      live.current = "";
      opts.setLive("");
      try {
        opts.setStreaming(true);
        const result = await answerQuestion({
          question,
          history,
          key,
          bookId,
          bookTitle,
          item: itemRef.current,
          spoilers: spoilersRef.current,
          signal: request.signal,
          onToken: (token) => {
            live.current += token;
            opts.setLive(live.current);
          },
        });
        opts.setSources(result.sources);
        threads.commit({
          ...base,
          messages: [
            ...withUser,
            {
              role: "ai",
              text: result.text,
              sources: result.sources,
              at: Date.now(),
            },
          ],
          updatedAt: Date.now(),
        });
      } catch (e) {
        if (request.signal.aborted) {
          // The reader stopped it: what was said stays.
          const said = live.current.trim();
          if (said) {
            threads.commit({
              ...base,
              messages: [
                ...withUser,
                {
                  role: "ai",
                  text: `${said} (stopped)`,
                  sources: [],
                  at: Date.now(),
                },
              ],
              updatedAt: Date.now(),
            });
          }
        } else {
          opts.setError(
          reasonOf(e instanceof Error ? e : new Error("The AI call failed.")),
        );
        }
      } finally {
        live.current = "";
        opts.setLive("");
        opts.setStreaming(false);
        opts.setSending(false);
        ctrl.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookId, bookTitle, threads],
  );

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q) return;
      opts.setSending(true);
      opts.setError(null);
      await answer(q, threads.thread?.messages ?? []);
    },
    [answer, threads.thread],
  );

  /** Ask the last question again — the user bubble is not duplicated. */
  const retry = useCallback(() => {
    const messages = threads.thread?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "user") continue;
      opts.setSending(true);
      opts.setError(null);
      void answer(m.text, messages.slice(0, i));
      return;
    }
  }, [answer, threads.thread]);

  /** The recap of what the reader has read so far. */
  const recap = useCallback(async () => {
    if (!bookId) return;
    const key = getEffectiveApiKey();
    if (!key) {
      opts.setError(NO_KEY);
      return;
    }
    opts.setSending(true);
    opts.setError(null);
    try {
      const result = await recapReadSoFar({
        bookId,
        maxItem: itemRef.current ?? 0,
        key,
        title: bookTitle,
      });
      const src = recapSources(bookId, result.passages);
      opts.setSources(src);
      const base = threads.thread;
      if (!base) return;
      threads.commit({
        ...base,
        messages: [
          ...base.messages,
          { role: "ai", text: result.text, sources: src, at: Date.now() },
        ],
        updatedAt: Date.now(),
      });
    } catch (e) {
      opts.setError(
          reasonOf(e instanceof Error ? e : new Error("The AI call failed.")),
        );
    } finally {
      opts.setSending(false);
    }
  }, [bookId, bookTitle, threads]);

  /** Stop the answer that is coming in. */
  const stop = useCallback(() => {
    ctrl.current?.abort();
  }, []);

  return { send, retry, recap, stop };
}
