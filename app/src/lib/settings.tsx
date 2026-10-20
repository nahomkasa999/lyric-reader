// Reader settings: persisted preferences that drive the reader through
// CSS custom properties (--lr-*). localStorage is fine for settings;
// books and reading position stay in IndexedDB (lib/db.ts).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isAutoSpeed } from "./autoscroll";

export type FontChoice =
  | "Geist"
  | "Noto Serif Georgian"
  | "Geist Mono"
  | "Lexend"
  | "System";

export type BgStyle = "gradient" | "solid" | "off";
export type BgColourMode = "alternate" | "single";

export interface ReaderSettings {
  font: FontChoice;
  /** current-sentence base size, px (18–48) */
  mainSize: number;
  /** trail/upcoming size, px (9–24) */
  trailSize: number;
  /** highlight wash colour (oklch) */
  highlight: string;
  /** hex or null = default */
  mainColor: string | null;
  /** 20–100 */
  mainOpacity: number;
  /** hex or null = default */
  trailColor: string | null;
  /** 10–100 */
  trailOpacity: number;
  /** auto-scroll speed multiplier (1 | 1.25 | 1.5 | 0.75) */
  autoScrollSpeed: number;
  /** ambient background style */
  bgStyle: BgStyle;
  /** ambient background colour mode */
  bgColourMode: BgColourMode;
  /** ambient background colour hex */
  bgColor: string;
  /** ambient background motion enabled */
  bgMotion: boolean;
  /** ambient background intensity 0-100 */
  bgIntensity: number;
  /** read aloud: every sentence you move to is spoken out loud */
  readAloud: boolean;
  /** the chosen voice (voiceURI); "" = the browser default */
  readAloudVoice: string;
  /** speaking speed, 0.5 – 2 */
  readAloudRate: number;
}

export const FONT_STACKS: Record<FontChoice, string> = {
  Geist: "var(--font-sans)",
  "Noto Serif Georgian": "var(--font-serif)",
  "Geist Mono": "var(--font-mono)",
  Lexend: "Lexend, var(--font-sans)",
  System: "ui-sans-serif, system-ui, sans-serif",
};

export const FONT_CHOICES: FontChoice[] = [
  "Geist",
  "Noto Serif Georgian",
  "Geist Mono",
  "Lexend",
  "System",
];

// The user's own 5-colour highlight palette, exactly as in his code.
export const HIGHLIGHT_COLORS = [
  "oklch(0.62 0.2 266)", // indigo (default)
  "oklch(0.85 0.17 90)", // amber
  "oklch(0.75 0.18 150)", // green
  "oklch(0.68 0.2 20)", // red
  "oklch(0.72 0.19 330)", // pink
];

export const DEFAULT_SETTINGS: ReaderSettings = {
  font: "Geist",
  mainSize: 30,
  trailSize: 13,
  highlight: HIGHLIGHT_COLORS[0],
  mainColor: null,
  mainOpacity: 100,
  trailColor: null,
  trailOpacity: 30,
  autoScrollSpeed: 1,
  bgStyle: "gradient",
  bgColourMode: "alternate",
  bgColor: "#A6E22E",
  bgMotion: true,
  bgIntensity: 60,
  readAloud: false,
  readAloudVoice: "",
  readAloudRate: 1,
};

const KEY = "lyric-reader.settings-v1";
const LEGACY_SCALE_KEY = "lyric-reader.font-scale";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function isHex(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
}

function isBgStyle(s: unknown): s is BgStyle {
  return s === "gradient" || s === "solid" || s === "off";
}

function isBgColourMode(s: unknown): s is BgColourMode {
  return s === "alternate" || s === "single";
}

export function load(): ReaderSettings {
  const d = { ...DEFAULT_SETTINGS };
  // Migrate the old A−/A+ font scale (0.8–1.4 around a 41.6px base).
  try {
    const legacy = parseFloat(localStorage.getItem(LEGACY_SCALE_KEY) ?? "");
    if (Number.isFinite(legacy)) {
      d.mainSize = clamp(Math.round(30 * clamp(legacy, 0.8, 1.4)), 18, 48);
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<ReaderSettings>;
    if (s.font && FONT_CHOICES.includes(s.font)) d.font = s.font;
    if (typeof s.mainSize === "number") d.mainSize = clamp(Math.round(s.mainSize), 18, 48);
    if (typeof s.trailSize === "number") d.trailSize = clamp(Math.round(s.trailSize), 9, 24);
    if (typeof s.highlight === "string" && s.highlight.startsWith("oklch("))
      d.highlight = s.highlight;
    d.mainColor = isHex(s.mainColor) ? s.mainColor : null;
    if (typeof s.mainOpacity === "number") d.mainOpacity = clamp(Math.round(s.mainOpacity), 20, 100);
    d.trailColor = isHex(s.trailColor) ? s.trailColor : null;
    if (typeof s.trailOpacity === "number") d.trailOpacity = clamp(Math.round(s.trailOpacity), 10, 100);
    if (isAutoSpeed(s.autoScrollSpeed)) d.autoScrollSpeed = s.autoScrollSpeed;
    if (isBgStyle(s.bgStyle)) d.bgStyle = s.bgStyle;
    if (isBgColourMode(s.bgColourMode)) d.bgColourMode = s.bgColourMode;
    if (isHex(s.bgColor)) d.bgColor = s.bgColor;
    if (typeof s.bgMotion === "boolean") d.bgMotion = s.bgMotion;
    if (typeof s.bgIntensity === "number" && s.bgIntensity >= 0 && s.bgIntensity <= 100) {
      d.bgIntensity = Math.round(s.bgIntensity);
    } else if (typeof s.bgIntensity === "number") {
      // out of range -> invalid per test expectation
      /* fall back */
    } else {
      /* not a number -> keep default */
    }
    if (typeof s.readAloud === "boolean") d.readAloud = s.readAloud;
    if (typeof s.readAloudVoice === "string") d.readAloudVoice = s.readAloudVoice;
    if (typeof s.readAloudRate === "number" && Number.isFinite(s.readAloudRate)) {
      d.readAloudRate = Math.min(2, Math.max(0.5, s.readAloudRate));
    }
  } catch {
    /* corrupt prefs -> defaults */
  }
  return d;
}

/** Push settings into CSS custom properties so the reader restyles live. */
export function applySettings(s: ReaderSettings): void {
  const r = document.documentElement.style;
  r.setProperty("--lr-font", FONT_STACKS[s.font]);
  r.setProperty("--lr-main-size", `${s.mainSize}px`);
  r.setProperty("--lr-trail-size", `${s.trailSize}px`);
  r.setProperty("--lr-hl", s.highlight);
  r.setProperty("--lr-cm", s.mainColor ?? "#ffffff");
  r.setProperty("--lr-mo", String(s.mainOpacity));
  r.setProperty("--lr-ct", s.trailColor ?? "#ffffff");
  r.setProperty("--lr-to", String(s.trailOpacity));
}

interface SettingsCtx {
  settings: ReaderSettings;
  update: (p: Partial<ReaderSettings>) => void;
  reset: () => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ReaderSettings>(load);

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  const persist = useCallback((s: ReaderSettings) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback(
    (p: Partial<ReaderSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...p };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    persist({ ...DEFAULT_SETTINGS });
  }, [persist]);

  const value = useMemo(
    () => ({ settings, update, reset }),
    [settings, update, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSettings must be used inside SettingsProvider");
  return c;
}
