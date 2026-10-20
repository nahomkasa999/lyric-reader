// The ambient background recipe — shared by the real background (behind the
// reader and Home) and by the live preview in Settings, so the preview is
// the same picture, only smaller.
//
// The look (DESIGN.md): one soft glow rising from the bottom of the screen,
// fading to black by ~55% of the height. Nothing else on the page glows.
//
// The gradient itself lives in CSS (ambient.css) — the values travel from
// here as custom properties, so the hue can be animated as a number.

export type AmbientMode = "alternate" | "single";

/** The hue the alternate cycle starts and ends on: green. */
export const AMBIENT_START_HUE = 120;

/** Hue stops of the alternate cycle: green → teal → blue → indigo →
    purple → pink → amber → back to green. */
export const AMBIENT_HUES = [120, 180, 220, 250, 290, 330, 40];

/** One full colour cycle: 4 minutes — slow enough that the change is
    barely noticed. */
export const AMBIENT_CYCLE_SECONDS = 240;

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

/** #rrggbb with an alpha — the colour at a given strength. */
export function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex) ?? [166, 226, 46];
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(a.toFixed(3))})`;
}

/** The custom properties the glow reads (see ambient.css). */
export interface GlowVars {
  "--ambient-hue": string;
  "--ambient-a1": string;
  "--ambient-a2": string;
  "--ambient-a3": string;
  "--ambient-c1": string;
  "--ambient-c2": string;
  "--ambient-c3": string;
}

export interface Glow {
  /** The class that carries the recipe. */
  className: string;
  /** The values the recipe reads. */
  style: GlowVars;
}

/**
 * The glow: the class that paints it and the values it paints with.
 *
 * Alternate reads the animated hue; one colour holds the user's pick.
 */
export function glow(opts: {
  mode: AmbientMode;
  color: string;
  intensity: number;
}): Glow {
  const a = Math.max(0, Math.min(100, opts.intensity)) / 100;
  const hue =
    opts.mode === "alternate" ? AMBIENT_START_HUE : hexToHue(opts.color);
  return {
    className: opts.mode === "single" ? "glow-layer glow-single" : "glow-layer",
    style: {
      "--ambient-hue": String(Math.round(hue)),
      "--ambient-a1": String(Number(a.toFixed(3))),
      "--ambient-a2": String(Number((a * 0.6).toFixed(3))),
      "--ambient-a3": String(Number((a * 0.28).toFixed(3))),
      "--ambient-c1": rgba(opts.color, a),
      "--ambient-c2": rgba(opts.color, a * 0.6),
      "--ambient-c3": rgba(opts.color, a * 0.28),
    },
  };
}
