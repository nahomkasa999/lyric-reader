// The voices (v4.8) — 28 cards you can audition, the way ChatGPT lets
// you hear a voice before you commit to it. The card you pick is the
// voice the reader uses.
import { KOKORO_VOICES } from "../../lib/kokoro";

interface Props {
  /** the voice in use */
  voice: string;
  /** the voice being previewed right now */
  previewing: string | null;
  onPick: (id: string) => void;
  onPreview: (id: string) => void;
}

export default function VoiceList({
  voice,
  previewing,
  onPick,
  onPreview,
}: Props) {
  return (
    <div className="voice-list" data-testid="voice-list">
      {KOKORO_VOICES.map((v) => {
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
            <span className="voice-name">
              {v.traits ? `${v.traits} ` : ""}
              {v.name}
            </span>
            <span className="voice-meta">
              {v.lang.toUpperCase()} · {v.gender[0]} · {v.grade}
            </span>
          </button>
        );
      })}
    </div>
  );
}
