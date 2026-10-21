// The voices (v4.9) — the account's ElevenLabs voices, each with a ▶ you
// can press to hear it before you commit to it, the way ChatGPT lets you
// audition a voice. The card you pick is the voice the reader uses.
export interface VoiceCard {
  id: string;
  name: string;
  /** the small note beside the name: accent, gender, category */
  meta: string;
}

interface Props {
  voices: VoiceCard[];
  /** the voice in use */
  voice: string;
  /** the voice being previewed right now */
  previewing: string | null;
  onPick: (id: string) => void;
  onPreview: (id: string) => void;
}

export default function VoiceList({
  voices,
  voice,
  previewing,
  onPick,
  onPreview,
}: Props) {
  if (!voices.length) {
    return (
      <p className="voice-empty" data-testid="voice-list-empty">
        No voices yet — add an ElevenLabs key in Settings, or pick the
        phone&apos;s own voice.
      </p>
    );
  }
  return (
    <div className="voice-list" data-testid="voice-list">
      {voices.map((v) => {
        const on = v.id === voice;
        const playing = previewing === v.id;
        return (
          <button
            key={v.id}
            data-testid={`voice-${v.id}`}
            className={`voice-card${on ? " on" : ""}`}
            onClick={() => onPick(v.id)}
          >
            <span
              className="voice-play"
              role="button"
              tabIndex={0}
              aria-label={`Preview ${v.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onPreview(v.id);
              }}
            >
              {playing ? "❙❙" : "▶"}
            </span>
            <span className="voice-name">{v.name}</span>
            <span className="voice-meta">{v.meta}</span>
          </button>
        );
      })}
    </div>
  );
}
