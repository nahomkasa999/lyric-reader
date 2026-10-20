// The ambient background recipe — shared by the real background (behind the
// reader and Home) and by the live preview in Settings, so the preview is
// the same picture, only smaller.
//
// The look (DESIGN.md + the Oct 20 review): a wide rectangle anchored to the
// bottom of the screen, filled with a vertical linear gradient — strongest
// at the bottom edge, fading evenly to nothing by ~55-60% of the height.
// The top edge of that rectangle is a slow wave, and the wave moves.

export type AmbientMode = "alternate" | "single";

/** The hue the alternate cycle starts and ends on: green. */
export const AMBIENT_START_HUE = 120;

/** Hue stops of the alternate cycle: green → teal → blue → indigo →
    purple → pink → amber → back to green. */
export const AMBIENT_HUES = [120, 180, 220, 250, 290, 330, 40];

/** One full colour cycle: 4 minutes — slow enough that the change is
    barely noticed. */
export const AMBIENT_CYCLE_SECONDS = 240;

/**
 * The wave: the top edge of the glow. Two shapes, half a phase apart.
 * The bottom layer is the wave itself; the top layer fades in and out on
 * top of it, so the edge undulates without the shape ever being redrawn.
 *
 * The CSS keyframes in ambient.css animate the same two shapes — keep them
 * in step.
 */
export const AMBIENT_WAVE_A =
  "M -140 465 C -118.7 467.7, -54.7 477.0, -12.0 481.5 C 30.7 485.9, 73.3 489.9, 116.0 491.6 C 158.7 493.3, 201.3 493.3, 244.0 491.6 C 286.7 489.9, 329.3 485.9, 372.0 481.5 C 414.7 477.0, 457.3 470.5, 500.0 465.0 C 542.7 459.5, 585.3 453.0, 628.0 448.5 C 670.7 444.1, 713.3 440.1, 756.0 438.4 C 798.7 436.7, 841.3 436.7, 884.0 438.4 C 926.7 440.1, 969.3 444.1, 1012.0 448.5 C 1054.7 453.0, 1118.7 462.3, 1140.0 465.0 L 1140 620 L -140 620 Z";

export const AMBIENT_WAVE_B =
  "M -140 465 C -118.7 462.3, -54.7 453.0, -12.0 448.5 C 30.7 444.1, 73.3 440.1, 116.0 438.4 C 158.7 436.7, 201.3 436.7, 244.0 438.4 C 286.7 440.1, 329.3 444.1, 372.0 448.5 C 414.7 453.0, 457.3 459.5, 500.0 465.0 C 542.7 470.5, 585.3 477.0, 628.0 481.5 C 670.7 485.9, 713.3 489.9, 756.0 491.6 C 798.7 493.3, 841.3 493.3, 884.0 491.6 C 926.7 489.9, 969.3 485.9, 1012.0 481.5 C 1054.7 477.0, 1118.7 467.7, 1140.0 465.0 L 1140 620 L -140 620 Z";

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
  /** the animated hue (alternate mode) */
  "--ambient-hue": string;
  /** the strongest stop — the bottom edge of the glow */
  "--ambient-a1": string;
  /** the middle stop of the fade */
  "--ambient-a2": string;
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
    className: opts.mode === "single" ? "ambient-glow ambient-single" : "ambient-glow",
    style: {
      "--ambient-hue": String(Math.round(hue)),
      "--ambient-a1": String(Number(a.toFixed(3))),
      "--ambient-a2": String(Number((a * 0.45).toFixed(3))),
      "--ambient-color": opts.color,
    },
  };
}
