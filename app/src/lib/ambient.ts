// The ambient glow recipe — the colours, the cycle and the strength.
//
// It is the single source of truth for the look, shared by the WebGL
// shader (components/AmbientCanvas.tsx) and by the CSS fallback
// (ambient.css), so both draw the same picture.
//
// The look (DESIGN.md + the Oct 20 references): a soft, wide light that
// rises from the bottom of the screen and reaches up to about half the
// height. It is brighter on the right, near-black teal at the top of the
// light, warming to yellow-green at the bottom, and the shapes inside it
// move like slow water.

export type AmbientMode = "alternate" | "single";

/** The hue the cycle starts and ends on: green. */
export const AMBIENT_START_HUE = 120;

/**
 * The colour cycle — 19 stops around the wheel, closed back on green.
 * Green → spring → teal → cyan → blue → indigo → violet → purple →
 * orchid → pink → rose → red → coral → amber → gold → yellow → lime.
 * The stops are interpolated, so the colour never jumps.
 */
export const AMBIENT_HUES = [
  120, 145, 165, 185, 200, 215, 230, 250, 265, 285, 310, 330, 350, 5, 25,
  40, 55, 75, 95,
];

/** One full colour cycle: 5 minutes — slow enough that the change is
 *  barely noticed, long enough to walk through every hue. */
export const AMBIENT_CYCLE_SECONDS = 300;

/** How far the light reaches up the screen, as a share of the height. */
export const AMBIENT_DEPTH = 0.46;

/** The strongest the glow may ever get: a haze, never a neon strip. */
export const AMBIENT_GAIN_CAP = 2.8;

/** The strongest alpha the CSS fallback may use. */
export const AMBIENT_ALPHA_CAP = 0.55;

/** A colour in 0..1, ready for a uniform. */
export type Rgb = [number, number, number];

/** The three tones of the light: its top, its body and its accent. */
export interface Tones {
  /** near-black and cooled — the top of the light */
  deep: Rgb;
  /** the body of the light */
  main: Rgb;
  /** the accent, pulled toward yellow */
  bright: Rgb;
}

/** Everything the shader needs for one frame. */
export interface Palette {
  deep: Rgb;
  main: Rgb;
  bright: Rgb;
  /** the overall strength (0..1.25) */
  gain: number;
  /** the hue the palette was built from */
  hue: number;
}

const HEX = /^#([0-9a-fA-F]{6})$/;

/** The top of the light: a teal. It is always cool, whatever hue the glow
 *  is carrying — the reference shows the same teal over every colour.
 *  The three tones share one level: the light's own falloff does the
 *  darkening, so the ramp only turns the colour. */
const DEEP_TONE: Rgb = hslToRgb(168, 0.45, 0.36);

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** #rrggbb → [r, g, b] in 0..255; null when the string is not a hex. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = HEX.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** #rrggbb → [hue°, saturation, lightness]; green when it cannot be read. */
export function hexToHsl(hex: string): [number, number, number] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [AMBIENT_START_HUE, 0.7, 0.45];
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [AMBIENT_START_HUE, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

/** The hue of a hex colour in degrees; green when it cannot be read. */
export function hexToHue(hex: string): number {
  return hexToHsl(hex)[0];
}

/** hsl → rgb in 0..1. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * clamp(s, 0, 1);
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const table: Rgb[] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const rgb = table[Math.floor(hue / 60) % 6];
  return [
    clamp(rgb[0] + m, 0, 1),
    clamp(rgb[1] + m, 0, 1),
    clamp(rgb[2] + m, 0, 1),
  ];
}

/** The shortest way round the wheel from one hue to the next. */
const HUE_DELTAS = AMBIENT_HUES.map((h, i) => {
  const next = AMBIENT_HUES[(i + 1) % AMBIENT_HUES.length];
  return (next - h + 540) % 360 - 180;
});

/** The hue of the cycle at a given moment. The cycle is closed, so the
 *  colour at the end is the colour at the start, and the wheel is crossed
 *  the short way (pink → red, not pink → green). */
export function hueAt(elapsedSeconds: number): number {
  const span = AMBIENT_CYCLE_SECONDS;
  const t = (((elapsedSeconds % span) + span) % span) / span;
  const scaled = t * AMBIENT_HUES.length;
  const i = Math.floor(scaled) % AMBIENT_HUES.length;
  const frac = scaled - Math.floor(scaled);
  const h = AMBIENT_HUES[i] + HUE_DELTAS[i] * frac;
  return (h + 360) % 360;
}

/** The three tones of a hue.
 *
 *  The light is a ramp: a near-black teal at the top of it, the body
 *  colour in the middle, and a yellow-green accent down at the bottom.
 *  The reference reads teal → green → olive as the light goes down. */
export function tones(hue: number): Tones {
  return {
    deep: DEEP_TONE,
    main: hslToRgb(hue - 8, 0.3, 0.34),
    bright: hslToRgb(hue - 46, 0.45, 0.4),
  };
}

/** The three tones of a colour the user picked: it keeps its own hue and
 *  saturation, at the same level as the cycling glow, so the two modes
 *  are as bright as each other. */
export function tonesFromHex(hex: string): Tones {
  const [h, s] = hexToHsl(hex);
  return {
    deep: DEEP_TONE,
    main: hslToRgb(h, Math.min(0.76, s), 0.34),
    bright: hslToRgb(h - 24, Math.min(0.6, s), 0.42),
  };
}

/** The strength of the light: 0..1 of the cap, so 100 is the brightest. */
export function gainFor(intensity: number): number {
  const i = clamp(Number(intensity) || 0, 0, 100) / 100;
  return Number((i * AMBIENT_GAIN_CAP).toFixed(4));
}

/** The whole palette for one frame. */
export function palette(opts: {
  mode: AmbientMode;
  color: string;
  intensity: number;
  /** seconds since the glow started */
  elapsed: number;
}): Palette {
  const hue =
    opts.mode === "alternate" ? hueAt(opts.elapsed) : hexToHue(opts.color);
  const t = opts.mode === "alternate" ? tones(hue) : tonesFromHex(opts.color);
  return { ...t, gain: gainFor(opts.intensity), hue };
}

/** The custom properties the CSS fallback reads (see ambient.css). */
export interface GlowVars {
  "--ambient-hue": string;
  "--ambient-a1": string;
  "--ambient-color": string;
}

export interface Glow {
  className: string;
  style: GlowVars;
}

/** The CSS fallback: the class that paints it and the values it paints
 *  with. It has no shader, so the browser cycles the hue for it (see
 *  ambientCycleKeyframes) and the CSS drifts it. */
export function glow(opts: {
  mode: AmbientMode;
  color: string;
  intensity: number;
}): Glow {
  const i = clamp(Number(opts.intensity) || 0, 0, 100) / 100;
  const a = i * AMBIENT_ALPHA_CAP;
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

/** The colour cycle as CSS: the keyframes and the length of the cycle.
 *  The CSS fallback walks the same stops as the shader. One source of
 *  truth: this list. */
export function ambientCycleStyles(): string {
  const stops = AMBIENT_HUES.map((h, i) => {
    const pct = (i / AMBIENT_HUES.length) * 100;
    return `  ${pct.toFixed(3)}% { --ambient-hue: ${h}; }`;
  });
  stops.push(`  100% { --ambient-hue: ${AMBIENT_START_HUE}; }`);
  return [
    `:root { --ambient-cycle: ${AMBIENT_CYCLE_SECONDS}s; }`,
    `@keyframes ambient-hue-cycle {\n${stops.join("\n")}\n}`,
  ].join("\n");
}

/** Put the cycle in the document, once. */
export function installCycleStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("ambient-cycle-styles")) return;
  const style = document.createElement("style");
  style.id = "ambient-cycle-styles";
  style.textContent = ambientCycleStyles();
  document.head.appendChild(style);
}
