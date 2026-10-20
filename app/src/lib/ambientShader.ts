// The ambient glow, drawn by a small WebGL shader.
//
// The look (the reference screenshot + DESIGN.md): a soft, wide light that
// rises from the bottom of the screen and fades out by about half the
// height. Its top edge is a slow wave that moves like water — it rises and
// falls, it never pulses in and out.
//
// The shader is a single full-screen triangle: no textures, no geometry, no
// dependencies. Everything the look needs is a uniform, so the colour (the
// cycling hue, or the one colour the user picked), the strength and the
// speed can all change while it runs.

/** The vertex shader: one full-screen triangle. */
export const AMBIENT_VERTEX = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * The fragment shader.
 *
 * · a slow swell (two sine waves) + drifting noise gives the water surface
 * · the surface rises and falls on its own slow cycle
 * · the light fades out just above the surface and grows towards the bottom
 * · the colour is a three-stop ramp: the deep tone near the surface, the
 *   main colour in the body, the bright accent at the bottom
 */
export const AMBIENT_FRAGMENT = `
precision mediump float;

uniform vec2  uRes;       // the canvas size in pixels
uniform float uTime;      // seconds since the start (frozen when motion is off)
uniform float uDepth;     // how far the light reaches up the screen (0..1)
uniform float uAmp;       // how tall the wave is
uniform float uFreq;      // how many waves fit across the width
uniform float uSpeed;     // how fast the water moves
uniform float uDensity;   // how much noise the surface carries
uniform float uIntensity; // the strength of the light (0..1)
uniform float uBias;      // 1 = even across the width, < 1 = brighter right
uniform vec3  uDeep;      // the colour at the surface
uniform vec3  uMain;      // the body of the light
uniform vec3  uBright;    // the accent at the bottom

// --- a cheap value noise -------------------------------------------------
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  // 0 at the bottom of the canvas, 1 at the top.
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uTime * uSpeed;

  // --- the surface of the water -----------------------------------------
  // Two slow swells, a third of a phase apart, and a drift of noise.
  float swellA = sin((uv.x * uFreq + t * 0.55) * 6.28318) * 0.5 + 0.5;
  float swellB = sin((uv.x * uFreq * 0.47 - t * 0.32 + 1.7) * 6.28318) * 0.5 + 0.5;
  float drift = fbm(vec2(uv.x * uFreq * 0.30 + t * 0.22, t * 0.12));
  float surface = mix(swellA, drift, uDensity);
  surface = mix(surface, swellB, 0.35);

  // The whole surface rises and falls, slowly: this is the water.
  float swell = sin(t * 0.42) * 0.5 + 0.5;
  float height = uDepth + (surface - 0.5) * uAmp + (swell - 0.5) * uAmp * 0.6;

  // --- the light ---------------------------------------------------------
  // d is the distance below the surface: 0 at the surface, uDepth at the
  // bottom of the screen.
  float d = height - uv.y;
  float body = clamp(d / max(uDepth, 0.001), 0.0, 1.0);
  float glow = pow(body, 1.1);
  // A soft shoulder right at the surface, so the edge never cuts.
  glow *= smoothstep(0.0, 0.035, d);

  // --- the colour --------------------------------------------------------
  // The light leans to one side, the way the reference does.
  float bias = mix(uBias, 1.0, smoothstep(0.05, 1.0, uv.x));
  glow *= bias;

  vec3 col = mix(uDeep, uMain, smoothstep(0.0, 0.55, body));
  col = mix(col, uBright, smoothstep(0.55, 1.0, body));

  col *= glow * uIntensity;

  // A touch of dither: a smooth gradient on a cheap panel bands otherwise.
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.004;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** The uniforms the fragment shader reads. */
export const AMBIENT_UNIFORMS = [
  "uRes",
  "uTime",
  "uDepth",
  "uAmp",
  "uFreq",
  "uSpeed",
  "uDensity",
  "uIntensity",
  "uBias",
  "uDeep",
  "uMain",
  "uBright",
] as const;

/** How the water is tuned — the look, in one place. */
export const AMBIENT_LOOK = {
  /** how far up the screen the light reaches (0.43 = a bit under half) */
  depth: 0.43,
  /** how tall the wave is */
  amp: 0.1,
  /** how many swells fit across the width */
  freq: 1.15,
  /** how fast the water moves (slow) */
  speed: 0.16,
  /** how much noise rides on the surface */
  density: 0.45,
  /** how much the light leans to the right (1 = even) */
  bias: 0.62,
} as const;
