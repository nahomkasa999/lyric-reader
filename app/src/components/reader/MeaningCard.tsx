// The meaning card (v4.13): what a word means.
//
// Anchored at the sentence, styled like the action popup. It says what
// the word means, what it means IN this sentence, and it can be saved.
//
// The card can be long — a word with three definitions and two examples
// is taller than a phone. So the text scrolls INSIDE the card and the
// buttons (Save, Close) stay put: the reader never has to hunt for
// them below the fold.
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

/** The text of the card, and the buttons under it. */
function parts(
  meaning: MeaningState,
  voiceURI: string,
  onSave: () => void,
  onClose: () => void,
  onOpenSettings: () => void,
): { body: React.ReactNode; actions: React.ReactNode } {
  const close = (
    <button
      data-testid="meaning-close"
      className="meaning-close"
      onClick={onClose}
    >
      ✕
    </button>
  );
  const closeWide = (
    <button
      data-testid="meaning-close"
      className="meaning-close"
      onClick={onClose}
      style={{ flex: 1 }}
    >
      Close
    </button>
  );
  const toSettings = (
    <button
      data-testid="meaning-to-settings"
      className="meaning-save"
      style={{ flex: 1 }}
      onClick={onOpenSettings}
    >
      Add key in Settings
    </button>
  );

  if (meaning.status === "ready" && meaning.model) {
    const model = meaning.model;
    return {
      body: (
        <>
          <div className="meaning-word">
            {model.word}
            <button
              data-testid="meaning-say"
              aria-label={`Say ${model.word}`}
              className="ml-2 inline-grid h-7 w-7 place-items-center align-middle rounded-full border border-border"
              onClick={() =>
                sayWord(model.word || meaning.text, { voiceURI })
              }
            >
              <SpeakerIcon />
            </button>
          </div>
          {model.phonetic && (
            <div className="meaning-phonetic">{model.phonetic}</div>
          )}
          {model.groups.map((g, gi) => (
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
          {model.inContext && (
            <div className="meaning-context">
              <b>In this sentence</b>
              {model.inContext}
            </div>
          )}
        </>
      ),
      actions: (
        <div className="meaning-actions">
          <button
            data-testid="meaning-save"
            className={`meaning-save${meaning.saved ? " saved" : ""}`}
            disabled={meaning.saved}
            onClick={onSave}
          >
            {meaning.saved ? "Saved ✓" : "Save word"}
          </button>
          {close}
        </div>
      ),
    };
  }

  if (meaning.status === "loading") {
    return {
      body: <div className="meaning-status">Looking it up…</div>,
      actions: null,
    };
  }
  if (meaning.status === "not-found") {
    return {
      body: (
        <div className="meaning-status">
          Not in the dictionary.
          <br />
          Check the spelling, or select fewer words.
        </div>
      ),
      actions: <div className="meaning-actions">{closeWide}</div>,
    };
  }
  if (meaning.status === "needs-key") {
    return {
      body: (
        <div className="meaning-status">
          Phrases need the AI to define them.
          <br />
          Add your free Gemini key to switch it on.
        </div>
      ),
      actions: (
        <div className="meaning-actions">
          {toSettings}
          {close}
        </div>
      ),
    };
  }
  if (meaning.status === "offline") {
    return {
      body: (
        <div className="meaning-status">
          Couldn't reach the dictionary. Check your connection — or add a
          Gemini key in Settings and meanings will come from AI instead.
        </div>
      ),
      actions: (
        <div className="meaning-actions">
          {toSettings}
          {close}
        </div>
      ),
    };
  }
  return {
    body: (
      <div className="meaning-status">
        Something went wrong looking that up — try again.
      </div>
    ),
    actions: <div className="meaning-actions">{closeWide}</div>,
  };
}

export default function MeaningCard({
  meaning,
  cardRef,
  voiceURI,
  onSave,
  onClose,
  onOpenSettings,
}: Props) {
  const { body, actions } = parts(
    meaning,
    voiceURI,
    onSave,
    onClose,
    onOpenSettings,
  );
  return (
    <div className="meaning-layer" data-testid="meaning-layer">
      <div
        ref={cardRef}
        data-testid="meaning-card"
        className="menu meaning-card"
        role="dialog"
        aria-label="Word meaning"
      >
        <div className="meaning-body">{body}</div>
        {actions}
      </div>
    </div>
  );
}
