// Settings → Read aloud (v4.8).
//
// Two engines, one page:
//  · HD — Kokoro-82M running on the phone. The sheet asks for the
//    one-time download (≈86 MB); after that it works offline.
//  · The phone's own voice — always there, never great.
//
// The voice itself is picked in the sheet, the way ChatGPT lets you
// audition a voice before you commit to it.
import { useEffect, useState } from "react";
import VoiceSheet from "../reader/VoiceSheet";
import { Group, Row, SliderRow, Switch } from "./controls";
import { useSettings } from "../../lib/settings";
import {
  KOKORO_VOICES,
  kokoroInstalled,
  kokoroSupported,
  webgpuAvailable,
} from "../../lib/kokoro";

export default function ReadAloudGroup() {
  const { settings, update } = useSettings();
  const [installed, setInstalled] = useState(false);
  const [gpu, setGpu] = useState(false);
  const [sheet, setSheet] = useState(false);
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
    };
  }, []);

  const voice = KOKORO_VOICES.find((v) => v.id === settings.readAloudVoice);

  return (
    <>
      <Group
        id="read-aloud"
        title="Read aloud"
        hint="Hear the page spoken out loud while you follow along."
      >
        <Row label="Read aloud">
          <div className="set-switch-row">
            <span className="set-switch-copy">Speak the sentences</span>
            <Switch
              testid="read-aloud-toggle"
              checked={settings.readAloud}
              onChange={(v) => update({ readAloud: v })}
              label="Speak the sentences"
            />
          </div>
          <p className="set-note">
            {settings.readAloud
              ? "On — every sentence you move to is spoken out loud."
              : "Off — tap the speaker in the reader to start a reading."}
          </p>
        </Row>

        <Row label="Voice">
          <button
            data-testid="read-aloud-voice"
            className="set-chip"
            onClick={() => setSheet(true)}
          >
            {voice ? `${voice.traits ?? ""} ${voice.name}`.trim() : "Choose…"}
          </button>
          <p className="set-note">
            {!supported
              ? "This phone cannot run the HD engine — the phone's own voice will be used."
              : installed
                ? `HD voice installed · ${gpu ? "WebGPU" : "WASM"} · on this phone.`
                : "HD voice not installed yet — the sheet will ask (≈86 MB, once)."}
          </p>
        </Row>

        <Row label="Speed">
          <SliderRow
            testid="read-aloud-rate"
            min={50}
            max={200}
            value={Math.round(settings.readAloudRate * 100)}
            onChange={(v) => update({ readAloudRate: v / 100 })}
            suffix="%"
          />
        </Row>
      </Group>

      {sheet && (
        <VoiceSheet
          onClose={() => setSheet(false)}
          voice={settings.readAloudVoice}
          onVoiceChange={(v) => update({ readAloudVoice: v })}
          speed={settings.readAloudRate}
          onSpeedChange={(v) => update({ readAloudRate: v })}
          engine={settings.readAloudEngine}
          onEngineChange={(v) => update({ readAloudEngine: v })}
        />
      )}
    </>
  );
}
