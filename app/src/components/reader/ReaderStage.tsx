// The stage (v4.13): the page of the book.
//
// The track holds ONE page of items and is translated so the current
// item sits in the middle of the screen. The parts of an item are the
// steps: only the current one is bright, the rest are the muted trail.
import { decorateText } from "../../lib/vocab";
import type { Mark } from "./readerTypes";
import type { PageItem } from "./readerTypes";

interface Props {
  items: PageItem[];
  /** the current item index */
  current: number;
  /** the current part inside the item */
  part: number;
  /** the marks of the book, by part key */
  marks: Record<string, Mark>;
  /** the saved words, so they can be dotted */
  vocabNorms: string[];
  /** the stage element — the gestures listen on it */
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** the track element — the reader places it */
  trackRef: React.RefObject<HTMLDivElement | null>;
}

export default function ReaderStage({
  items,
  current,
  part,
  marks,
  vocabNorms,
  stageRef,
  trackRef,
}: Props) {
  return (
    <div ref={stageRef} data-testid="stage" className="reader-stage">
      <div ref={trackRef} data-testid="track" className="reader-track">
        {items.map(({ idx, item, parts: ps }) => {
          const isCur = idx === current;
          const cls =
            "s" +
            (item.kind === "heading" ? " h" : item.kind === "bullet" ? " li" : "") +
            (isCur ? " cur" : idx < current ? " past" : "") +
            (idx > current + 1 || idx < current - 2 ? " far" : "") +
            (item.paraStart && idx > 0 ? " gap" : "");
          return (
            <p
              key={idx}
              data-item={idx}
              data-testid={isCur ? "current-item" : `item-${idx}`}
              className={cls}
              style={
                item.kind === "bullet"
                  ? { marginLeft: item.depth * 18 }
                  : undefined
              }
            >
              {ps.map((t, p) => {
                const key = `${idx}:${p}`;
                const mk = marks[key];
                const mark = mk ?? {
                  highlight: false,
                  bookmark: false,
                  note: null,
                };
                return (
                  <span
                    key={p}
                    data-p={p}
                    data-testid={`part-${idx}-${p}`}
                    className={
                      "pt" +
                      (isCur && p === part ? " on" : "") +
                      (mark.highlight ? " hl" : "") +
                      (mark.bookmark ? " bm" : "") +
                      (mark.note ? " nt" : "")
                    }
                  >
                    {decorateText(t, vocabNorms).map((run, k) =>
                      run.match ? (
                        <span key={k} className="voc">
                          {run.text}
                        </span>
                      ) : (
                        <span key={k}>{run.text}</span>
                      ),
                    )}
                  </span>
                );
              })}
            </p>
          );
        })}
      </div>
    </div>
  );
}
