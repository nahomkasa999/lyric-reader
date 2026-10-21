// The meaning card (v4.13): what a word means.
//
// Anchored at the sentence, styled like the action popup. It says what
// the word means, what it means IN this sentence, and it can be saved.
import { sayWord } from "../../lib/wordSound";
import { SpeakerIcon } from "./icons";
import type { MeaningState } from "./readerTypes";

interface Props {
  meaning: MeaningState;
  /** the card element — the reader anchors it */
  cardRef: React.RefObject<HTMLDivElement | null>;
  /** the phone's own voice, for saying the word again */
  voiceURI: string;
  onSave: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

export default function MeaningCard({
  meaning,
  cardRef,
  voiceURI,
  onSave,
  onClose,
  onOpenSettings,
}: Props) {
  // The reader's own handler stops the playback and closes the card.
  const toSettings = () => onOpenSettings();
  return (
    <div className="meaning-layer" data-testid="meaning-layer">
      <div
        ref={cardRef}
        data-testid="meaning-card"
        className="menu meaning-card"
        role="dialog"
        aria-label="Word meaning"
      >
        {meaning.status === "loading" && (
          <div className="meaning-status">Looking it up…</div>
        )}
        {meaning.status === "ready" && meaning.model && (
          <>
            <div className="meaning-word">
              {meaning.model.word}
              <button
                data-testid="meaning-say"
                aria-label={`Say ${meaning.model.word}`}
                className="ml-2 inline-grid h-7 w-7 place-items-center align-middle rounded-full border border-border"
                onClick={() =>
                  sayWord(meaning.model?.word || meaning.text, { voiceURI })
                }
              >
                <SpeakerIcon />
              </button>
            </div>
            {meaning.model.phonetic && (
              <div className="meaning-phonetic">{meaning.model.phonetic}</div>
            )}
            {meaning.model.groups.map((g, gi) => (
              <div key={gi}>
                <div className="meaning-pos">{g.partOfSpeech}</div>
                {g.defs.map((d, di) => (
                  <div key={di}>
                    <div className="meaning-def">
                      {di + 1}. {d.definition}
                    </div>
                    {d.example && (
                      <div className="meaning-example">"{d.example}"</div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {meaning.model.inContext && (
              <div className="meaning-context">
                <b>In this sentence</b>
                {meaning.model.inContext}
              </div>
            )}
            <div className="meaning-actions">
              <button
                data-testid="meaning-save"
                className={`meaning-save${meaning.saved ? " saved" : ""}`}
                disabled={meaning.saved}
                onClick={onSave}
              >
                {meaning.saved ? "Saved ✓" : "Save word"}
              </button>
              <button
                data-testid="meaning-close"
                className="meaning-close"
                onClick={onClose}
              >
                ✕
              </button>
            </div>
          </>
        )}
        {meaning.status === "not-found" && (
          <div className="meaning-status">
            Not in the dictionary.
            <br />
            Check the spelling, or select fewer words.
            <div className="meaning-actions">
              <button
                data-testid="meaning-close"
                className="meaning-close"
                onClick={onClose}
                style={{ flex: 1 }}
              >
                Close
              </button>
            </div>
          </div>
        )}
        {meaning.status === "needs-key" && (
          <div className="meaning-status">
            Phrases need the AI to define them.
            <br />
            Add your free Gemini key to switch it on.
            <div className="meaning-actions">
              <button
                data-testid="meaning-to-settings"
                className="meaning-save"
                style={{ flex: 1 }}
                onClick={toSettings}
              >
                Add key in Settings
              </button>
              <button
                data-testid="meaning-close"
                className="meaning-close"
                onClick={onClose}
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {meaning.status === "offline" && (
          <div className="meaning-status">
            Couldn't reach the dictionary. Check your connection — or add a
            Gemini key in Settings and meanings will come from AI instead.
            <div className="meaning-actions">
              <button
                data-testid="meaning-to-settings"
                className="meaning-save"
                style={{ flex: 1 }}
                onClick={toSettings}
              >
                Add key in Settings
              </button>
              <button
                data-testid="meaning-close"
                className="meaning-close"
                onClick={onClose}
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {meaning.status === "error" && (
          <div className="meaning-status">
            Something went wrong looking that up — try again.
            <div className="meaning-actions">
              <button
                data-testid="meaning-close"
                className="meaning-close"
                onClick={onClose}
                style={{ flex: 1 }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
