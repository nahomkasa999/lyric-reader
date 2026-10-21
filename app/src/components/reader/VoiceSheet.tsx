// The voice sheet (v4.9): pick the voice, hear it, change the engine.
//
// The voices come from ElevenLabs — the account's own library, including
// anything the user cloned. Each one has a ▶ to audition it before you
// commit, the way ChatGPT lets you hear a voice first.
//
// Without a key the sheet says so and points at Settings; the phone's
// own voice is always there as a fallback.
import { useEffect, useState } from "react";
import VoiceList, { type VoiceCard } from "./VoiceList";
import {
  DEFAULT_VOICE,
  ELEVEN_KEYS_URL,
  STANDARD_VOICES,
  elevenError,
  listVoices,
  playAudio,
  speakAudio,
  stopAudio,
  type ElevenVoice,
} from "../../lib/elevenlabs";
import { speak as speakSystem } from "../../lib/speech";

interface Props {
  onClose: () => void;
  /** the chosen voice */
  voice: string;
  onVoiceChange: (v: string) => void;
  /** 0.7 – 1.5 */
  speed: number;
  onSpeedChange: (s: number) => void;
  /** which engine reads */
  engine: "eleven" | "system";
  onEngineChange: (e: "eleven" | "system") => void;
  /** the ElevenLabs key (empty = none) */
  key: string;
}

const SAMPLE = "This is how the page will sound when it reads to you.";

function toCard(v: ElevenVoice): VoiceCard {
  const bits = [
    v.accent,
    v.gender,
    v.category && v.category !== "premade" ? v.category : "",
  ].filter(Boolean);
  return { id: v.id, name: v.name, meta: bits.join(" · ") || "voice" };
}

export default function VoiceSheet({
  onClose,
  voice,
  onVoiceChange,
  speed,
  onSpeedChange,
  engine,
  onEngineChange,
  key,
}: Props) {
  const [voices, setVoices] = useState<VoiceCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  // The account's voices — fetched once, when the sheet opens. A key
  // without the "voices_read" permission cannot list them; the standard
  // voices are used instead, so reading still works.
  useEffect(() => {
    if (!key) {
      setVoices([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    void listVoices(key)
      .then((v) => {
        if (alive) setVoices(v.map(toCard));
      })
      .catch((e) => {
        if (!alive) return;
        const err = elevenError(e);
        setVoices(STANDARD_VOICES);
        setError(
          err.missing === "voices_read"
            ? "This key cannot read your voice list — the Voices permission is off. The standard voices below still work. To pick your own voices, edit the key in ElevenLabs → Profile → API Keys and turn Voices on."
            : err.message,
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      stopAudio();
    };
  }, [key]);

  /** Audition a voice — the thing you actually want from a picker. */
  const preview = async (id: string) => {
    if (previewing) {
      stopAudio();
      setPreviewing(null);
      return;
    }
    setPreviewing(id);
    try {
      if (engine === "eleven" && key) {
        const data = await speakAudio(SAMPLE, id, key, speed);
        await playAudio(data);
      } else {
        await speakSystem(SAMPLE, { rate: speed });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not play that voice.");
    }
    setPreviewing(null);
  };

  return (
    <div className="ask-layer" data-testid="voice-layer">
      <div
        className="ask-sheet voice-sheet"
        role="dialog"
        aria-label="Voice"
        data-testid="voice-sheet"
      >
        <div className="ask-header">
          <h2 className="voice-title">Voice</h2>
          <button
            data-testid="voice-close"
            className="ask-x"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ---- the engine ---- */}
        <div className="voice-engine" data-testid="voice-engine">
          <div className="voice-engine-copy">
            <b>ElevenLabs</b>
            <span>
              {!key
                ? "No key yet — add one in Settings."
                : loading
                  ? "Reading the voice list…"
                  : `${voices.length} voices available`}
            </span>
          </div>
          {!key && (
            <a
              data-testid="voice-key-link"
              className="set-chip shrink-0"
              href={ELEVEN_KEYS_URL}
              target="_blank"
              rel="noreferrer"
            >
              Get a key
            </a>
          )}
        </div>

        {error && (
          <p className="voice-note" data-testid="voice-error">
            {error}
          </p>
        )}

        {/* ---- the voices ---- */}
        <VoiceList
          voices={voices}
          voice={voice}
          previewing={previewing}
          onPick={onVoiceChange}
          onPreview={(id) => void preview(id)}
        />

        {/* ---- speed + fallback ---- */}
        <div className="voice-foot">
          <div className="voice-speed">
            <span>Speed</span>
            <input
              data-testid="voice-speed"
              type="range"
              min={70}
              max={150}
              value={Math.round(speed * 100)}
              onChange={(e) => onSpeedChange(Number(e.target.value) / 100)}
              className="w-full accent-primary"
              aria-label="Reading speed"
            />
            <span className="voice-speed-value">{speed.toFixed(2)}×</span>
          </div>
          <div className="voice-foot-row">
            <button
              data-testid="voice-engine-toggle"
              className="set-chip"
              onClick={() => onEngineChange(engine === "eleven" ? "system" : "eleven")}
            >
              {engine === "eleven" ? "Using ElevenLabs" : "Using the phone's voice"}
            </button>
            {voice !== DEFAULT_VOICE && engine === "eleven" && (
              <button
                data-testid="voice-default"
                className="set-chip"
                onClick={() => onVoiceChange(DEFAULT_VOICE)}
              >
                Default voice
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
