// The indexing strip (v4.13) — the line above the composer.
//
// It only shows when there is something to say: the books are being
// embedded, they are waiting for a connection, or the last attempt
// failed. The chat stays usable the whole time — the passages are
// already searchable, only the meaning is missing.
import type { IndexProgress } from "../../lib/indexJobs";

interface Props {
  jobs: IndexProgress[];
  online: boolean;
  onPause: () => void;
  onRetry: (bookId: string) => void;
}

export default function IndexStrip({ jobs, online, onPause, onRetry }: Props) {
  const waiting = jobs.filter((j) => j.state !== "done");
  if (!waiting.length) return null;

  const failed = waiting.find((j) => j.state === "failed");
  if (failed) {
    return (
      <div data-testid="assistant-index-strip" className="chat-strip">
        <span>Indexing failed: {failed.error ?? "something went wrong"}</span>
        <button onClick={() => onRetry(failed.bookId)}>Retry</button>
      </div>
    );
  }

  // A rate limit is not a failure — the queue is waiting its turn. Say
  // so, so the reader knows the app is working, not stuck.
  const throttled = waiting.find((j) => j.state === "pending" && j.error);
  if (throttled) {
    return (
      <div data-testid="assistant-index-strip" className="chat-strip">
        <span>{throttled.error}</span>
        <button onClick={onPause}>Pause</button>
      </div>
    );
  }

  if (!online) {
    return (
      <div data-testid="assistant-index-strip" className="chat-strip">
        <span>
          {waiting.length} book{waiting.length === 1 ? "" : "s"} waiting — they
          &apos;ll index when you&apos;re online.
        </span>
      </div>
    );
  }

  const running = waiting.find((j) => j.state === "running");
  const pct = running?.total
    ? Math.round((running.done / running.total) * 100)
    : 0;
  return (
    <div data-testid="assistant-index-strip" className="chat-strip">
      <span>
        Indexing {pct}% · {waiting.length} of {jobs.length} books
      </span>
      <button onClick={onPause}>Pause</button>
    </div>
  );
}
