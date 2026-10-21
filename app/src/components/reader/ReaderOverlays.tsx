// The floating cards of the reader (v4.13).
//
// Three of them: the pill above the selection (Meaning / Copy), the
// meaning card itself, and the saved-word preview that says what a
// dotted word means.
import MeaningCard from "./MeaningCard";
import VocabCard from "./VocabCard";
import type {
  MeaningState,
  SelectionState,
  VocabPreviewState,
} from "./readerTypes";

interface Props {
  /** the pill above the selection */
  selection: SelectionState | null;
  pillRef: React.RefObject<HTMLDivElement | null>;
  onMeaning: () => void;
  onCopy: () => void;
  /** the meaning card */
  meaning: MeaningState | null;
  meaningCardRef: React.RefObject<HTMLDivElement | null>;
  voiceURI: string;
  onSaveWord: () => void;
  onCloseMeaning: () => void;
  onOpenSettings: () => void;
  /** the saved-word preview */
  vocabPreview: VocabPreviewState | null;
  vocabCardRef: React.RefObject<HTMLDivElement | null>;
  onJumpVocab: () => void;
  onCloseVocab: () => void;
}

export default function ReaderOverlays({
  selection,
  pillRef,
  onMeaning,
  onCopy,
  meaning,
  meaningCardRef,
  voiceURI,
  onSaveWord,
  onCloseMeaning,
  onOpenSettings,
  vocabPreview,
  vocabCardRef,
  onJumpVocab,
  onCloseVocab,
}: Props) {
  return (
    <>
      {/* The floating selection pill (Meaning / Copy), above the selection. */}
      {selection && !meaning && (
        <div
          ref={pillRef}
          data-testid="selection-pill"
          className="sel-pill"
          style={{ top: selection.top, left: selection.left }}
        >
          <button
            data-testid="sel-meaning"
            className="sel-primary"
            onClick={onMeaning}
          >
            Meaning
          </button>
          <button data-testid="sel-copy" onClick={onCopy}>
            Copy
          </button>
        </div>
      )}

      {meaning && (
        <MeaningCard
          meaning={meaning}
          cardRef={meaningCardRef}
          voiceURI={voiceURI}
          onSave={onSaveWord}
          onClose={onCloseMeaning}
          onOpenSettings={onOpenSettings}
        />
      )}

      {/* The saved-word preview — tap a dotted word in the text. */}
      {vocabPreview && (
        <div className="meaning-layer" data-testid="vocab-layer">
          <VocabCard
            ref={vocabCardRef}
            record={vocabPreview.record}
            style={{ top: vocabPreview.top, left: vocabPreview.left }}
            onJump={onJumpVocab}
            onClose={onCloseVocab}
          />
        </div>
      )}
    </>
  );
}
