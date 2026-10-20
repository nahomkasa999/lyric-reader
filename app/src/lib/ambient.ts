// The ambient background recipe — shared by the real background (behind the
// reader and Home) and by the live preview in Settings, so the preview is
// the same picture, only smaller.
//
// The look (DESIGN.md + the Oct 20 reviews): a soft haze of colour at the
// bottom of the screen. It is one oversized, heavily blurred colour field
// whose centre sits BELOW the viewport — so on screen there is nothing but
// a smooth falloff: brightest at the bottom edge, easing to pure black by
// ~55% of the height, with no edge, line or shape anywhere.

export type AmbientMode = "alternate" | "single";

/** The hue the alternate cycle starts and ends on: green. */
export const AMBIENT_START_HUE = 120;

/** Hue stops of the alternate cycle: green → teal → blue → indigo →
    purple → pink → amber → back to green. */
export const AMBIENT_HUES = [120, 180, 220, 250, 290, 330, 40];

/** One full colour cycle: 4 minutes — slow enough that the change is
    barely noticed. */
export const AMBIENT_CYCLE_SECONDS = 240;

/** The haze never gets brighter than this share of the chosen intensity —
    it must read as a haze, not a neon strip. */
export const AMBIENT_ALPHA_CAP = 0.55;

const HEX = /^#([0-9a-fA-F]{6})$/;

/** #rrggbb → [r, g, b]; null when the string is not a 6-digit hex. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The hue of a hex colour in degrees; green (120) when it cannot be read. */
export function hexToHue(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return AMBIENT_START_HUE;
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return AMBIENT_START_HUE;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return h;
}

/** The custom properties the haze reads (see ambient.css). */
export interface GlowVars {
  /** the animated hue (alternate mode) */
  "--ambient-hue": string;
  /** the strongest alpha — the cap applied to the chosen intensity */
  "--ambient-a1": string;
  /** the colour the user picked (one colour mode) */
  "--ambient-color": string;
}

export interface Glow {
  /** The class that paints it. */
  className: string;
  /** The values the recipe reads. */
  style: GlowVars;
}

/**
 * The haze: the class that paints it and the values it paints with.
 *
 * Alternate reads the animated hue; one colour holds the user's pick.
 * The alpha is capped so the bottom of the screen stays a soft haze.
 */
export function glow(opts: {
  mode: AmbientMode;
  color: string;
  intensity: number;
}): Glow {
  const intensity = Math.max(0, Math.min(100, opts.intensity)) / 100;
  const a = intensity * AMBIENT_ALPHA_CAP;
  const hue =
    opts.mode === "alternate" ? AMBIENT_START_HUE : hexToHue(opts.color);
  return {
    className:
      opts.mode === "single" ? "ambient-glow ambient-single" : "ambient-glow",
    style: {
      "--ambient-hue": String(Math.round(hue)),
      "--ambient-a1": String(Number(a.toFixed(3))),
      "--ambient-color": opts.color,
    },
  };
}
