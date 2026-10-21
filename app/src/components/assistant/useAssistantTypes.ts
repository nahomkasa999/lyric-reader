// The assistant's types (v4.13) — the contract of the hook.
import type { IndexProgress } from "../../lib/indexJobs";
import type { AssistantMessage, Source, Thread } from "../../lib/assistantStore";

export interface AssistantState {
  threads: Thread[];
  thread: Thread | null;
  messages: AssistantMessage[];
  /** the answer is coming in */
  streaming: boolean;
  /** the text of the answer that is coming in */
  live: string;
  input: string;
  setInput: (s: string) => void;
  sending: boolean;
  error: string | null;
  /** ask the last question again */
  retry: () => void;
  /** stop the answer that is coming in */
  stop: () => void;
  send: (question: string) => Promise<void>;
  /** "what has happened so far?" */
  recap: () => Promise<void>;
  newThread: () => void;
  selectThread: (id: string) => void;
  deleteThread: (id: string) => void;
  /** how many passages the knowledge base holds */
  indexed: number;
  /** the indexing queue */
  jobs: IndexProgress[];
  /** is the phone online */
  online: boolean;
  /** stop the queue */
  pause: () => void;
  /** try one book again */
  retryIndex: (bookId: string) => void;
  hasKey: boolean;
  /** the sources of the last answer */
  sources: Source[];
  /** may the answer mention what happens later? */
  spoilers: boolean;
  setSpoilers: (v: boolean) => void;
  /** the questions an empty thread offers */
  suggestions: string[];
}

export interface AssistantOptions {
  /** the book that is open right now, if any */
  bookId?: string;
  /** the title of that book */
  bookTitle?: string;
  /** the item the reader is on — the boundary of the answer */
  item?: number;
}

/** What an empty thread asks when the book has no headings of its own. */
export const DEFAULT_SUGGESTIONS = [
  "What is happening?",
  "Who is this person?",
  "Where does this scene take place?",
];
