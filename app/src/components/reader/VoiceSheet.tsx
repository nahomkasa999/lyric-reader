// The voice sheet (v4.9): pick the voice, hear it, change the engine.
//
// The voices come from ElevenLabs — the account's own library, including
// anything the user cloned. Each one has a ▶ to audition it before you
// commit, the way ChatGPT lets you hear a voice first.
//
// The phone's own engine has voices too, and they are listed here as well
// (the phone's default first) — otherwise the phone's voice is always
// "the default thing", with nothing to choose.
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
import { isVoiceId } from "../../lib/elevenlabsVoices";
import { loadVoices, speak as speakSystem, type VoiceInfo } from "../../lib/speech";

interface Props {
  onClose: () => void;
  /** the chosen ElevenLabs voice */
  voice: string;
  onVoiceChange: (v: string) => void;
  /** the chosen voice of the phone's own engine (voiceURI) */
  systemVoice: string;
  onSystemVoiceChange: (v: string) => void;
  /** 0.7 – 1.5 */
  speed: number;
  onSpeedChange: (s: number) => void;
  /** which engine reads */
  engine: "eleven" | "system";
  onEngineChange: (e: "eleven" | "system") => void;
  /**
   * The ElevenLabs key.
   *
   * NOT named "key": that is a reserved React prop, and React never
   * passes it to the component — the sheet used to get `undefined` and
   * so never listed the account's voices at all.
   */
  apiKey: string;
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

/** The phone's voices, as cards. The phone's default comes first. */
function phoneCards(voices: VoiceInfo[], chosen: string): VoiceCard[] {
  const list: VoiceCard[] = [
    { id: "", name: "Phone's default", meta: "the system voice" },
  ];
  for (const v of voices) {
    list.push({
      id: v.uri,
      name: v.name,
      meta: v.local ? v.lang : `${v.lang} · online`,
    });
  }
  // The chosen voice must be in the list, even if the phone has since
  // dropped it — otherwise nothing looks picked.
  if (chosen && !list.some((c) => c.id === chosen)) {
    list.push({ id: chosen, name: "Your voice", meta: "chosen earlier" });
  }
  return list;
}

export default function VoiceSheet({
  onClose,
  voice,
  onVoiceChange,
  systemVoice,
  onSystemVoiceChange,
  speed,
  onSpeedChange,
  engine,
  onEngineChange,
  apiKey,
}: Props) {
  const [voices, setVoices] = useState<VoiceCard[]>([]);
  const [phone, setPhone] = useState<VoiceCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  // The phone's voice is the one the phone reads with — and without a
  // key, the one that reads at all.
  const phoneEngine = engine === "system" || !apiKey;
  // A stale setting can hold a phone voice name ("English (United
  // States)") from the old engine — that is not an ElevenLabs id.
  const chosenEleven = isVoiceId(voice) ? voice : DEFAULT_VOICE;
  const chosen = phoneEngine ? systemVoice : chosenEleven;

  // The account's voices — fetched once, when the sheet opens. A key
  // without the "voices_read" permission cannot list them; the standard
  // voices are used instead, so reading still works.
  useEffect(() => {
    if (!apiKey) {
      setVoices([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    void listVoices(apiKey)
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
  }, [apiKey]);

  // The phone's own voices — they arrive late in Chrome, so we wait for
  // the list instead of taking the empty one.
  useEffect(() => {
    let alive = true;
    void loadVoices().then((v) => {
      if (alive) setPhone(phoneCards(v, systemVoice));
    });
    return () => {
      alive = false;
    };
  }, [systemVoice]);

  /** Audition a voice — the thing you actually want from a picker. */
  const preview = async (id: string) => {
    if (previewing) {
      stopAudio();
      setPreviewing(null);
      return;
    }
    setPreviewing(id);
    try {
      // The engine of the LIST being shown decides the engine of the
      // preview: a phone voice sent to ElevenLabs comes back as
      // "An invalid ID has been received".
      if (!phoneEngine && apiKey) {
        const data = await speakAudio(SAMPLE, id, apiKey, speed);
        await playAudio(data);
      } else {
        await speakSystem(SAMPLE, { rate: speed, voiceURI: id });
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
            <b>{phoneEngine ? "This phone" : "ElevenLabs"}</b>
            <span>
              {phoneEngine
                ? phone.length
                  ? `${phone.length - 1} voices on this device`
                  : "The phone's own voice"
                : !apiKey
                  ? "No key yet — add one in Settings."
                  : loading
                    ? "Reading the voice list…"
                    : `${voices.length} voices available`}
            </span>
          </div>
          <button
            data-testid="voice-engine-toggle"
            className="set-chip shrink-0"
            onClick={() => onEngineChange(phoneEngine ? "eleven" : "system")}
          >
            {phoneEngine ? "Use ElevenLabs" : "Use this phone"}
          </button>
        </div>

        {/* No key: say it plainly — the phone's voice is reading, and
            this is why. */}
        {!apiKey && engine === "eleven" && (
          <>
            <p className="voice-note" data-testid="voice-no-key">
              There is no ElevenLabs key on this phone, so the phone&apos;s
              own voice reads. Add a free key in Settings → Read aloud to
              use the ElevenLabs voices.
            </p>
            <div className="voice-foot-row" style={{ margin: "0 16px 10px" }}>
              <a
                data-testid="voice-key-link"
                className="set-chip shrink-0"
                href={ELEVEN_KEYS_URL}
                target="_blank"
                rel="noreferrer"
              >
                Get a key
              </a>
              <button
                data-testid="voice-use-phone"
                className="set-chip"
                onClick={() => onEngineChange("system")}
              >
                Use this phone&apos;s voice
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="voice-note" data-testid="voice-error">
            {error}
          </p>
        )}

        {/* ---- the voices ---- */}
        {phoneEngine ? (
          <>
            <p className="voice-section" data-testid="voice-section-phone">
              This phone&apos;s voices
            </p>
            <VoiceList
              voices={phone}
              voice={chosen}
              previewing={previewing}
              onPick={onSystemVoiceChange}
              onPreview={(id) => void preview(id)}
            />
          </>
        ) : loading ? (
          <p className="voice-empty" data-testid="voice-list-loading">
            Reading the voice list…
          </p>
        ) : (
          <>
            <p className="voice-section" data-testid="voice-section-eleven">
              ElevenLabs voices
            </p>
            <VoiceList
              voices={voices}
              voice={chosen}
              previewing={previewing}
              onPick={onVoiceChange}
              onPreview={(id) => void preview(id)}
            />
          </>
        )}

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
              data-testid="voice-engine-toggle-2"
              className="set-chip"
              onClick={() => onEngineChange(phoneEngine ? "eleven" : "system")}
            >
              {phoneEngine ? "Switch to ElevenLabs" : "Switch to this phone"}
            </button>
            {!phoneEngine && chosenEleven !== DEFAULT_VOICE && (
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
