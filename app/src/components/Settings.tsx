// Settings — grouped glass sections (DESIGN.md, Oct 20 2026).
//
// Order: Background → Reading → Ambience → Read Aloud → Quiz → AI → Reset.
// A sticky glass preview at the top shows the chosen background with a
// sentence stack, live.
//
// Rules kept here:
// · on/off settings are switches, choices are chips or swatches
// · one glass recipe: only the sticky preview blurs, the groups keep the
//   same fill + border (max 3 blurred surfaces per screen)
// · motion: under 300ms, ease-out only, scale(0.97) on press
// · every data-testid from the old page still works
import { useEffect, useState } from "react";
import {
  FONT_CHOICES,
  FONT_STACKS,
  HIGHLIGHT_COLORS,
  useSettings,
  type BgColourMode,
  type BgStyle,
} from "../lib/settings";
import {
  getApiKey,
  getEnvApiKey,
  removeApiKey,
  setApiKey,
} from "../lib/apikey";
import { testApiKey } from "../lib/gemini";
import {
  getOpenRouterKey,
  removeOpenRouterKey,
  setOpenRouterKey,
  testOpenRouterKey,
} from "../lib/openrouter";
import BackgroundPreview from "./BackgroundPreview";
import { Group, Row, Segmented, SliderRow, Switch } from "./settings/controls";
import ReadAloudGroup from "./settings/ReadAloudGroup";
import "../settings.css";
import "../ambient.css";

interface Props {
  onBack: () => void;
}

/** Background presets — one hue each (DESIGN.md, colors). */
const BG_PRESETS = [
  { id: "green", label: "Green", hex: "#A6E22E" },
  { id: "indigo", label: "Indigo", hex: "#5B4FE9" },
  { id: "teal", label: "Teal", hex: "#2DD4BF" },
  { id: "amber", label: "Amber", hex: "#F5A524" },
  { id: "pink", label: "Pink", hex: "#F472B6" },
  { id: "purple", label: "Purple", hex: "#A855F7" },
];

const BG_STYLES: { id: BgStyle; label: string }[] = [
  { id: "gradient", label: "Gradient glow" },
  { id: "solid", label: "Solid" },
  { id: "off", label: "Off" },
];

const BG_MODES: { id: BgColourMode; label: string }[] = [
  { id: "alternate", label: "Alternate" },
  { id: "single", label: "One colour" },
];

/** True when the user asked the system for less motion. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
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
            className="set-field mono min-w-0 flex-1"
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

function OpenRouterKeySection() {
  const [key, setKey] = useState(() => getOpenRouterKey());
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const personal = key.trim().length > 0;

  return (
    <Row label="OpenRouter (fallback)">
      <div className="flex items-center gap-2">
        <input
          data-testid="openrouter-key"
          type={show ? "text" : "password"}
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setOpenRouterKey(e.target.value);
            setResult(null);
          }}
          placeholder="sk-or-…"
          autoComplete="off"
          spellCheck={false}
          className="set-field mono min-w-0 flex-1"
          aria-label="OpenRouter API key"
        />
        <button
          data-testid="openrouter-key-eye"
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
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          OpenRouter
        </a>{" "}
        — used only if Gemini fails. Stays on this phone only, sent only to
        OpenRouter.
      </p>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <button
          data-testid="openrouter-test"
          onClick={async () => {
            setTesting(true);
            setResult(null);
            const r = await testOpenRouterKey(key.trim());
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
            data-testid="openrouter-remove-key"
            onClick={() => {
              removeOpenRouterKey();
              setKey("");
              setResult(null);
            }}
            className="set-chip shrink-0"
          >
            Remove OpenRouter key
          </button>
        )}
        {result && (
          <span data-testid="openrouter-test-result" className="text-sm">
            {result}
          </span>
        )}
      </div>
    </Row>
  );
}

export default function Settings({ onBack }: Props) {
  const { settings, update, reset } = useSettings();
  const reduced = usePrefersReducedMotion();
  // The preview only drifts when the glow itself moves.
  const live = settings.bgMotion && !reduced && settings.bgStyle === "gradient";
  const colourOff = settings.bgStyle === "off";


  return (
    <div
      data-testid="settings-page"
      className="settings-page relative z-[1] min-h-dvh text-foreground"
      style={{ fontFamily: "var(--lr-font)" }}
    >
      <div className="mx-auto max-w-xl px-5 pt-[calc(14px+env(safe-area-inset-top))] pb-36">
        <div className="flex items-center gap-3">
          <button
            data-testid="settings-back"
            onClick={onBack}
            aria-label="Back"
            className="glass-btn"
          >
            ← Back
          </button>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Settings</h1>
        </div>

        {/* Sticky glass preview — the background and a sentence, live. */}
        <div
          className="set-preview-bar"
          style={{
            // The scrim follows the background: black for the glow, the
            // picked colour when the screen is filled flat.
            background:
              settings.bgStyle === "solid"
                ? `linear-gradient(to bottom, ${settings.bgColor}f0, ${settings.bgColor}b0)`
                : "linear-gradient(to bottom, #000000 0%, rgba(0,0,0,0.88) 62%, rgba(0,0,0,0.7) 100%)",
          }}
        >
          <div
            data-testid="settings-preview"
            className={`glass set-preview${live ? " live" : ""}`}
          >
            <div className="set-preview-stage">
              <BackgroundPreview settings={settings} live={live} />
            </div>
            <div className="set-preview-scrim" aria-hidden="true" />
            <div className="set-preview-copy">
              <p className="set-preview-trail">The previous sentence fades above.</p>
              <p data-testid="settings-preview-current" className="set-preview-current">
                This is the sentence you are reading.
              </p>
              <p className="set-preview-trail">The next one waits below.</p>
            </div>
          </div>
        </div>

        {/* ---------------- Background ---------------- */}
        <Group
          id="background"
          title="Background"
          hint="The glow behind every page. It never acts — it only sits there."
        >
          <Row label="Style">
            <Segmented
              options={BG_STYLES}
              value={settings.bgStyle}
              onChange={(v) => update({ bgStyle: v })}
              label="Background style"
              testid="bg-style"
            />
          </Row>

          <Row label="Colour mode">
            <div className="flex flex-wrap gap-2">
              {BG_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`bg-mode-${m.id}`}
                  aria-pressed={settings.bgColourMode === m.id}
                  disabled={colourOff}
                  onClick={() => update({ bgColourMode: m.id })}
                  className={`set-chip${
                    settings.bgColourMode === m.id ? " on" : ""
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="set-note">
              {settings.bgColourMode === "alternate"
                ? "Alternate — the glow slowly cycles through the hues."
                : "One colour — the glow holds the colour you pick."}
            </p>
          </Row>

          <Row label="Colour">
            <div className="flex flex-wrap items-center gap-2">
              {BG_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`bg-swatch-${p.id}`}
                  aria-label={`Background colour ${p.label}`}
                  aria-pressed={settings.bgColor.toLowerCase() === p.hex.toLowerCase()}
                  disabled={colourOff}
                  onClick={() => update({ bgColor: p.hex })}
                  className={`set-swatch${
                    settings.bgColor.toLowerCase() === p.hex.toLowerCase() ? " on" : ""
                  }`}
                  style={{ background: p.hex }}
                />
              ))}
              <input
                data-testid="bg-color-custom"
                type="color"
                value={settings.bgColor}
                disabled={colourOff}
                onChange={(e) => update({ bgColor: e.target.value })}
                className="set-color-input set-color-custom"
                aria-label="Custom background colour"
              />
              <span className="set-hex">{settings.bgColor.toUpperCase()}</span>
            </div>
            <p className="set-note">
              {settings.bgColourMode === "alternate"
                ? "The cycle passes through every one of these."
                : "Your pick, or use the colour wheel for your own."}
            </p>
          </Row>

          <Row label="Motion">
            <div className="set-switch-row">
              <span className="set-switch-copy">Let the glow drift</span>
              <Switch
                testid="bg-motion"
                checked={settings.bgMotion}
                onChange={(v) => update({ bgMotion: v })}
                disabled={settings.bgStyle !== "gradient"}
                label="Background motion"
              />
            </div>
            <p className="set-note">
              {settings.bgStyle === "gradient"
                ? "Off freezes the glow where it is."
                : "Only the gradient glow moves."}
            </p>
          </Row>

          <Row label="Intensity">
            <SliderRow
              testid="bg-intensity"
              min={0}
              max={100}
              value={settings.bgIntensity}
              onChange={(v) => update({ bgIntensity: v })}
              suffix="%"
              disabled={settings.bgStyle !== "gradient"}
            />
            <p className="set-note">
              {settings.bgStyle === "gradient"
                ? "How bright the glow is."
                : "Only the gradient glow has an intensity."}
            </p>
          </Row>
        </Group>

        {/* ---------------- Reading ---------------- */}
        <Group id="reading" title="Reading">
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
                className="set-color-input"
                aria-label="Main text colour"
              />
              <button
                data-testid="main-color-default"
                onClick={() => update({ mainColor: null })}
                className="set-chip shrink-0"
              >
                Default
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3">
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
                className="set-color-input"
                aria-label="Top and bottom text colour"
              />
              <button
                data-testid="trail-color-default"
                onClick={() => update({ trailColor: null })}
                className="set-chip shrink-0"
              >
                Default
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3">
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
        </Group>

        {/* ---------------- Ambience ---------------- */}
        <Group
          id="ambience"
          title="Ambience"
          hint="Music behind the page — paste a link and it plays quietly."
        >
          <Row label="Play ambience">
            <div className="set-switch-row">
              <span className="set-switch-copy">Background music</span>
              <Switch
                testid="ambience-toggle"
                checked={false}
                onChange={() => {}}
                disabled
                label="Background music"
              />
            </div>
            <p className="set-note">
              The music button at the bottom-left of the reader — tap it,
              paste a YouTube link, and it plays behind the page. A switch
              that starts it from here is not built yet.
            </p>
          </Row>
        </Group>

        {/* ---------------- Read aloud ---------------- */}
        <ReadAloudGroup />

        {/* ---------------- Quiz ---------------- */}
        <Group
          id="quiz"
          title="Quiz"
          hint="Check yourself on what you just read."
        >
          <Row label="Quiz">
            <div className="set-switch-row">
              <span className="set-switch-copy">Ask me questions</span>
              <Switch
                testid="quiz-toggle"
                checked={false}
                onChange={() => {}}
                disabled
                label="Ask me questions"
              />
            </div>
            <p className="set-note">Coming soon — not built yet.</p>
          </Row>
        </Group>

        {/* ---------------- AI keys ---------------- */}
        <Group
          id="ai"
          title="AI keys"
          hint="Bring your own key. It stays on this phone and is never logged."
        >
          <AiKeySection />
          <div className="mt-4">
            <OpenRouterKeySection />
          </div>
        </Group>

        {/* ---------------- Reset ---------------- */}
        <Group id="reset" title="Reset">
          <p className="set-note">
            Puts every setting back to the default. Your API keys stay where
            they are.
          </p>
          <button
            data-testid="settings-reset"
            onClick={reset}
            className="set-danger mt-3"
          >
            Reset settings
          </button>
        </Group>

        {/* v4.6: build stamp — a screenshot of this page always tells
            which build is actually running on the device. */}
        <p data-testid="build-id" className="mt-8 text-center text-xs opacity-40">
          Lyric Reader · build {__BUILD_ID__}
        </p>
      </div>
    </div>
  );
}
