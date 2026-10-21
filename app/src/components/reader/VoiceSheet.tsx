// The voice sheet (v4.8): pick the voice, and install the HD engine.
//
// Two things live here:
//  1. The HD engine (Kokoro-82M) — ~86 MB, downloaded once, then it runs
//     on the phone, offline, forever. The app asks before it downloads
//     anything; it never downloads behind the user's back.
//  2. The voice list — 28 voices, each with a preview button, the way
//     ChatGPT lets you audition a voice before you commit to it.
//
// If the phone can't run the HD engine (or the download fails), the
// sheet says so plainly and the phone's own voice takes over.
import { useEffect, useState } from "react";
import {
  DEFAULT_VOICE,
  kokoroInstalled,
  kokoroSupported,
  loadKokoro,
  removeKokoro,
  speakKokoro,
  stopKokoroAudio,
  webgpuAvailable,
  type LoadProgress,
} from "../../lib/kokoro";
import { speak as speakSystem } from "../../lib/speech";
import VoiceList from "./VoiceList";

interface Props {
  onClose: () => void;
  /** the chosen HD voice */
  voice: string;
  onVoiceChange: (v: string) => void;
  /** 0.5 – 2 */
  speed: number;
  onSpeedChange: (s: number) => void;
  /** "hd" = Kokoro, "system" = the phone's own voice */
  engine: "hd" | "system";
  onEngineChange: (e: "hd" | "system") => void;
}

const SAMPLE = "This is how the page will sound when it reads to you.";

export default function VoiceSheet({
  onClose,
  voice,
  onVoiceChange,
  speed,
  onSpeedChange,
  engine,
  onEngineChange,
}: Props) {
  const [installed, setInstalled] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [gpu, setGpu] = useState(false);
  const supported = kokoroSupported();

  useEffect(() => {
    let alive = true;
    void kokoroInstalled().then((v) => {
      if (alive) setInstalled(v);
    });
    void webgpuAvailable().then((v) => {
      if (alive) setGpu(v);
    });
    return () => {
      alive = false;
      stopKokoroAudio();
    };
  }, []);

  /** The one-time download. Everything after this comes from the cache. */
  const install = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await loadKokoro((p) => setProgress(p));
      setInstalled(true);
      setProgress(null);
    } catch (e) {
      console.error("voice engine install failed", e);
      setFailed(true);
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const uninstall = async () => {
    setBusy(true);
    await removeKokoro();
    setInstalled(false);
    setBusy(false);
  };

  /** Audition a voice — the thing you actually want from a picker. */
  const preview = async (id: string) => {
    if (previewing) {
      stopKokoroAudio();
      setPreviewing(null);
      return;
    }
    setPreviewing(id);
    try {
      if (engine === "hd" && installed) {
        await speakKokoro(SAMPLE, id, speed);
      } else {
        await speakSystem(SAMPLE, { rate: speed });
      }
    } catch {
      /* the phone refused to talk */
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

        {/* ---- the HD engine ---- */}
        <div className="voice-engine" data-testid="voice-engine">
          <div className="voice-engine-copy">
            <b>HD voice</b>
            <span>
              {!supported
                ? "This phone cannot run the HD engine."
                : installed
                  ? `Installed · ${gpu ? "WebGPU" : "WASM"} · on this phone`
                  : "Kokoro 82M · about 86 MB · downloaded once, then offline"}
            </span>
          </div>
          {supported &&
            (installed ? (
              <button
                data-testid="voice-remove"
                className="set-chip shrink-0"
                disabled={busy}
                onClick={() => void uninstall()}
              >
                Remove
              </button>
            ) : (
              <button
                data-testid="voice-download"
                className="set-chip shrink-0"
                disabled={busy}
                onClick={() => void install()}
              >
                {busy ? "…" : "Download"}
              </button>
            ))}
        </div>

        {progress && (
          <div className="voice-progress" data-testid="voice-progress">
            <div className="voice-progress-bar">
              <i style={{ width: `${progress.percent}%` }} />
            </div>
            <span>
              {progress.label} {progress.percent}% · {progress.mb} MB
            </span>
          </div>
        )}
        {failed && (
          <p className="voice-note" data-testid="voice-download-failed">
            The download did not finish. Check the connection and try again —
            the phone's own voice works in the meantime.
          </p>
        )}

        <VoiceList
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
              min={50}
              max={200}
              value={Math.round(speed * 100)}
              onChange={(e) => onSpeedChange(Number(e.target.value) / 100)}
              className="w-full accent-primary"
              aria-label="Reading speed"
            />
            <span className="voice-speed-value">{speed.toFixed(2)}×</span>
          </div>
          <button
            data-testid="voice-engine-toggle"
            className="set-chip"
            onClick={() => onEngineChange(engine === "hd" ? "system" : "hd")}
          >
            {engine === "hd" ? "Using the HD voice" : "Using the phone's voice"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_VOICE };
