// The saved-word preview: tap a dotted word in the text and this card
// says what it means — the definition you saved, the phonetic, and the
// line the AI gave for the sentence it came from.
import { forwardRef } from "react";
import type { VocabRecord } from "../../lib/db";

interface Props {
  record: VocabRecord;
  /** jump to the sentence where the word was saved */
  onJump: () => void;
  onClose: () => void;
  /** where the card sits (the reader anchors it to the word) */
  style?: React.CSSProperties;
}

const VocabCard = forwardRef<HTMLDivElement, Props>(function VocabCard(
  { record, onJump, onClose, style },
  ref,
) {
  return (
    <div
      ref={ref}
      data-testid="vocab-preview"
      className="menu meaning-card vocab-card"
      style={style}
      role="dialog"
      aria-label={`${record.text} — saved word`}
    >
      <div className="meaning-word">{record.text}</div>
      {record.phonetic && (
        <div className="meaning-phonetic">{record.phonetic}</div>
      )}
      {record.defs.map((d, i) => (
        <div key={i} className="meaning-def">
          {d}
        </div>
      ))}
      {!record.defs.length && (
        <div className="meaning-status">Saved — no definition yet.</div>
      )}
      {record.contextMeaning && (
        <div className="meaning-context">
          <b>In this sentence</b>
          {record.contextMeaning}
        </div>
      )}
      <div className="meaning-actions">
        <button
          data-testid="vocab-preview-jump"
          className="meaning-save"
          onClick={onJump}
        >
          Go to it
        </button>
        <button
          data-testid="vocab-preview-close"
          className="meaning-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
});

export default VocabCard;
