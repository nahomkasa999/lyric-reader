// Settings → Read aloud (v4.9).
//
// The voice comes from ElevenLabs. The key is the reader's OWN: they
// paste it here, it stays on their phone, and it is used for their own
// quota. There is no shared key in the build — everyone brings their
// own.
//
// Without any key the reader falls back to the phone's own voice.
import { useEffect, useState } from "react";
import VoiceSheet from "../reader/VoiceSheet";
import { Group, Row, SliderRow, Switch } from "./controls";
import { useSettings } from "../../lib/settings";
import {
  ELEVEN_KEYS_URL,
  getElevenLabsKey,
  removeElevenLabsKey,
  setElevenLabsKey,
  standardVoiceName,
  testKey,
} from "../../lib/elevenlabs";

export default function ReadAloudGroup() {
  const { settings, update } = useSettings();
  const [key, setKey] = useState(() => getElevenLabsKey());
  const [sheet, setSheet] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (key) setElevenLabsKey(key);
  }, [key]);

  const personal = key.trim().length > 0;

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

        <Row label="ElevenLabs key">
          <div className="flex items-center gap-2">
            <input
              data-testid="elevenlabs-key"
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setResult(null);
              }}
              placeholder="sk_…"
              autoComplete="off"
              spellCheck={false}
              className="set-field mono min-w-0 flex-1"
              aria-label="ElevenLabs API key"
            />
            <button
              data-testid="elevenlabs-test"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                setResult(null);
                const r = await testKey(
                  key.trim() || getElevenLabsKey(),
                );
                setTesting(false);
                setResult(
                  r.ok
                    ? r.reason
                      ? `✓ ${r.reason}`
                      : `✓ Key works — ${r.voices} voices`
                    : `✗ ${r.reason}`,
                );
              }}
              className="set-chip shrink-0"
            >
              {testing ? "Testing…" : "Test key"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Free key from{" "}
            <a
              href={ELEVEN_KEYS_URL}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              ElevenLabs
            </a>{" "}
            — stays on this phone only, sent only to ElevenLabs.{" "}
            {personal
              ? "Your key is in use — your own quota."
              : "Without a key the phone's own voice reads instead."}
          </p>
          {personal && (
            <button
              data-testid="elevenlabs-remove-key"
              onClick={() => {
                removeElevenLabsKey();
                setKey("");
                setResult(null);
              }}
              className="set-chip mt-2"
            >
              Remove my key
            </button>
          )}
          {result && (
            <span
              data-testid="elevenlabs-test-result"
              className="mt-2 block text-sm"
            >
              {result}
            </span>
          )}
        </Row>

        <Row label="Voice">
          <button
            data-testid="read-aloud-voice"
            className="set-chip"
            onClick={() => setSheet(true)}
          >
            {settings.readAloudEngine === "system"
              ? "This phone's voice"
              : standardVoiceName(settings.readAloudVoice) ||
                (settings.readAloudVoice
                  ? `${settings.readAloudVoice.slice(0, 8)}…`
                  : "Choose…")}
          </button>
          <p className="set-note">
            The voices on your ElevenLabs account — hear one before you pick
            it.
          </p>
        </Row>

        <Row label="Speed">
          <SliderRow
            testid="read-aloud-rate"
            min={70}
            max={150}
            value={Math.round(settings.readAloudRate * 100)}
            onChange={(v) => update({ readAloudRate: v / 100 })}
            suffix="%"
            label="Reading speed"
          />
        </Row>
      </Group>

      {sheet && (
        <VoiceSheet
          onClose={() => setSheet(false)}
          voice={settings.readAloudVoice}
          onVoiceChange={(v) => update({ readAloudVoice: v })}
          systemVoice={settings.readAloudSystemVoice}
          onSystemVoiceChange={(v) => update({ readAloudSystemVoice: v })}
          speed={settings.readAloudRate}
          onSpeedChange={(v) => update({ readAloudRate: v })}
          engine={settings.readAloudEngine}
          onEngineChange={(v) => update({ readAloudEngine: v })}
          apiKey={getElevenLabsKey()}
        />
      )}
    </>
  );
}
