import { useState } from "react";
import {
  FONT_CHOICES,
  FONT_STACKS,
  HIGHLIGHT_COLORS,
  useSettings,
} from "../lib/settings";
import {
  getApiKey,
  getEnvApiKey,
  removeApiKey,
  setApiKey,
} from "../lib/apikey";
import { testApiKey } from "../lib/gemini";

interface Props {
  onBack: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <label className="mb-2 block text-[13px] text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function SliderRow({
  testid,
  min,
  max,
  value,
  onChange,
  suffix,
}: {
  testid: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        data-testid={testid}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-primary"
      />
      <span className="w-14 shrink-0 text-right text-sm text-foreground tabular-nums">
        {value}
        {suffix}
      </span>
    </div>
  );
}

function AiKeySection() {
  const [key, setKey] = useState(() => getApiKey());
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  // v4.3: env key is baked at build time — static for the session.
  const [hasEnvKey] = useState(() => getEnvApiKey().length > 0);
  const personal = key.trim().length > 0;

  return (
    <>
      <Row label="Gemini API key (AI meanings, Ask)">
        {/* v4.3 state (b): no personal key, but the app ships one. */}
        {!personal && hasEnvKey && (
          <p
            data-testid="gemini-app-key"
            className="mb-3 text-sm text-foreground"
          >
            ✓ App key active — meanings and Ask are on.
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            data-testid="gemini-key"
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setApiKey(e.target.value);
              setResult(null);
            }}
            placeholder={hasEnvKey ? "Paste your own key (optional)" : "AIza…"}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2.5 font-mono text-sm"
            aria-label="Gemini API key"
          />
          <button
            data-testid="gemini-key-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide key" : "Show key"}
            className="set-chip shrink-0"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Free key from{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Google AI Studio
          </a>
          {personal || !hasEnvKey
            ? " — stays on this phone only, never sent anywhere except Google's AI servers."
            : " — paste yours here to use it instead of the app key."}
        </p>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <button
            data-testid="gemini-test"
            onClick={async () => {
              setTesting(true);
              setResult(null);
              // v4.3: tests whichever key is active (personal wins over app).
              const active = key.trim() || getEnvApiKey();
              const r = await testApiKey(active);
              setTesting(false);
              setResult(
                r.ok
                  ? `✓ Key works — using ${r.model}`
                  : `✗ ${r.reason}`,
              );
            }}
            disabled={testing}
            className="set-chip shrink-0"
          >
            {testing ? "Testing…" : "Test key"}
          </button>
          {personal && (
            <button
              data-testid="gemini-remove-key"
              onClick={() => {
                removeApiKey();
                setKey("");
                setResult(null);
              }}
              className="set-chip shrink-0"
            >
              Remove personal key
            </button>
          )}
          {result && (
            <span data-testid="gemini-test-result" className="text-sm">
              {result}
            </span>
          )}
        </div>
      </Row>
    </>
  );
}

export default function Settings({ onBack }: Props) {
  const { settings, update, reset } = useSettings();

  return (
    <div
      data-testid="settings-page"
      className="min-h-dvh bg-background text-foreground"
    >
      <div className="mx-auto max-w-xl px-6 pt-14 pb-24">
        <div className="flex items-center gap-3">
          <button
            data-testid="settings-back"
            onClick={onBack}
            aria-label="Back"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        </div>

        <Row label="Font">
          <div className="flex flex-wrap gap-2">
            {FONT_CHOICES.map((f) => (
              <button
                key={f}
                data-testid={`font-chip-${f}`}
                onClick={() => update({ font: f })}
                className={`set-chip${settings.font === f ? " on" : ""}`}
                style={{ fontFamily: FONT_STACKS[f] }}
              >
                {f}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Main sentence size">
          <SliderRow
            testid="setting-main-size"
            min={18}
            max={48}
            value={settings.mainSize}
            onChange={(v) => update({ mainSize: v })}
            suffix="px"
          />
        </Row>

        <Row label="Top and bottom size">
          <SliderRow
            testid="setting-trail-size"
            min={9}
            max={24}
            value={settings.trailSize}
            onChange={(v) => update({ trailSize: v })}
            suffix="px"
          />
        </Row>

        <Row label="Highlight colour">
          <div className="flex flex-wrap gap-2">
            {HIGHLIGHT_COLORS.map((c, i) => (
              <button
                key={c}
                data-testid={`hl-chip-${i}`}
                onClick={() => update({ highlight: c })}
                aria-label={`Highlight colour ${i + 1}`}
                className={`hl-chip${settings.highlight === c ? " on" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Row>

        <Row label="Main text colour and opacity">
          <div className="flex items-center gap-3">
            <input
              data-testid="main-color"
              type="color"
              value={settings.mainColor ?? "#ffffff"}
              onChange={(e) => update({ mainColor: e.target.value })}
              className="h-9 w-11 shrink-0 cursor-pointer border-0 bg-transparent p-0"
            />
            <button
              data-testid="main-color-default"
              onClick={() => update({ mainColor: null })}
              className="set-chip shrink-0"
            >
              Default
            </button>
            <input
              data-testid="main-opacity"
              type="range"
              min={20}
              max={100}
              value={settings.mainOpacity}
              onChange={(e) =>
                update({ mainOpacity: parseInt(e.target.value, 10) })
              }
              className="w-full accent-primary"
            />
            <span className="w-12 shrink-0 text-right text-sm tabular-nums">
              {settings.mainOpacity}%
            </span>
          </div>
        </Row>

        <Row label="Top and bottom text colour and opacity">
          <div className="flex items-center gap-3">
            <input
              data-testid="trail-color"
              type="color"
              value={settings.trailColor ?? "#ffffff"}
              onChange={(e) => update({ trailColor: e.target.value })}
              className="h-9 w-11 shrink-0 cursor-pointer border-0 bg-transparent p-0"
            />
            <button
              data-testid="trail-color-default"
              onClick={() => update({ trailColor: null })}
              className="set-chip shrink-0"
            >
              Default
            </button>
            <input
              data-testid="trail-opacity"
              type="range"
              min={10}
              max={100}
              value={settings.trailOpacity}
              onChange={(e) =>
                update({ trailOpacity: parseInt(e.target.value, 10) })
              }
              className="w-full accent-primary"
            />
            <span className="w-12 shrink-0 text-right text-sm tabular-nums">
              {settings.trailOpacity}%
            </span>
          </div>
        </Row>

        <AiKeySection />

        <button
          data-testid="settings-reset"
          onClick={reset}
          className="mt-8 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium"
        >
          Reset settings
        </button>

        {/* Live preview: muted line / current line / muted line, in settings */}
        <div
          data-testid="settings-preview"
          className="mt-6 rounded-xl border border-border bg-black p-4"
          style={{ fontFamily: "var(--lr-font)" }}
        >
          <p
            style={{
              fontSize: "var(--lr-trail-size)",
              color:
                "color-mix(in oklch, var(--lr-ct) calc(var(--lr-to) * 1%), transparent)",
            }}
          >
            The previous sentence fades above.
          </p>
          <p
            data-testid="settings-preview-current"
            className="my-3 font-semibold"
            style={{
              fontSize: "var(--lr-main-size)",
              lineHeight: 1.22,
              color:
                "color-mix(in oklch, var(--lr-cm) calc(var(--lr-mo) * 1%), transparent)",
            }}
          >
            This is the sentence you are reading.
          </p>
          <p
            style={{
              fontSize: "var(--lr-trail-size)",
              color:
                "color-mix(in oklch, var(--lr-ct) calc(var(--lr-to) * 0.55 * 1%), transparent)",
            }}
          >
            The next one waits below.
          </p>
        </div>
        {/* v4.6: build stamp — a screenshot of this page always tells
            which build is actually running on the device. */}
        <p
          data-testid="build-id"
          className="mt-8 text-center text-xs opacity-40"
        >
          Lyric Reader · build {__BUILD_ID__}
        </p>
      </div>
    </div>
  );
}
