// The ambient glow, drawn by a small WebGL shader.
//
// The look (the reference screenshot + DESIGN.md): a soft, wide light
// that rises from the bottom of the screen and fades out by about half
// the height. Its top edge is a slow wave that moves like water, and
// inside the light there are soft overlapping lobes that drift and
// change shape — it is a living field, not a gradient.
//
// The shader is a single full-screen triangle: no textures, no geometry,
// no dependencies. Everything the look needs is a uniform, so the colour
// (the cycling hue, or the one colour the user picked), the strength and
// the speed can all change while it runs.

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
 * · a noise field, warped by more noise, gives the organic lobes
 * · a slow swell rolls along the top edge of the light, so the edge is
 *   never a straight line
 * · the light falls off towards the top and grows towards the bottom
 * · it leans to the right, the way the reference does
 * · the colour is a three-stop ramp: near-black teal at the top of the
 *   light, the body colour, and the bright accent down at the bottom
 */
export const AMBIENT_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;       // the drawing buffer size in pixels
uniform float uTime;      // seconds since the start (frozen when motion is off)
uniform float uDepth;     // how far the light reaches up the screen (0..1)
uniform float uAmp;       // how tall the wave on the top edge is
uniform float uFreq;      // how many swells fit across the width
uniform float uSpeed;     // how fast the field moves
uniform float uWarp;      // how much the noise is warped by other noise
uniform float uGain;      // the strength of the light
uniform float uBias;      // 1 = even across the width, < 1 = brighter right
uniform vec3  uDeep;      // the colour at the top of the light
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
    p = p * 2.03 + 1.7;
    a *= 0.5;
  }
  return v;
}

void main() {
  // 0,0 is the bottom-left of the canvas.
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / max(uRes.y, 1.0);
  float t = uTime * uSpeed;

  // The field: noise warped by more noise, so the shapes inside the light
  // are organic — clouds, not circles.
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.0;
  vec2 q = vec2(
    fbm(p + vec2(0.0, t * 0.10)),
    fbm(p + vec2(5.2, 1.3) - t * 0.08)
  );
  float f = fbm(p + uWarp * 1.6 * q + vec2(t * 0.05, -t * 0.06));
  float g = fbm(p * 0.5 - vec2(t * 0.03, t * 0.02));

  // The top edge of the light: a slow swell, never a straight line.
  float swell = sin((uv.x * uFreq + t * 0.30) * 6.28318) * 0.5 + 0.5;
  float edge = uDepth - uAmp * (0.4 * (swell - 0.5) + 0.6 * (g - 0.5));

  // The light: 1 at the bottom, 0 above the edge. The falloff is
  // straight, so the glow reads as an even wash of light.
  float raw = clamp((edge - uv.y) / max(edge, 0.001), 0.0, 1.0);

  // It leans to the right, the way the reference does.
  float bias = mix(uBias, 1.0, smoothstep(0.0, 1.0, uv.x));

  // The lobes: the field shapes the light, so the shapes overlap, drift
  // and change. This is what makes it a shader and not a gradient.
  float lobes = 0.35 + 1.35 * f;
  float light = raw * bias * lobes * uGain;

  // The colour: near-black teal at the top, the body, the accent below.
  vec3 col = mix(uDeep, uMain, smoothstep(0.0, 0.42, raw));
  col = mix(col, uBright, smoothstep(0.35, 0.95, raw) * (0.35 + 0.65 * f));
  col *= light;

  // A touch of dither: a smooth gradient on a cheap panel bands otherwise.
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.004;

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
  "uWarp",
  "uGain",
  "uBias",
  "uDeep",
  "uMain",
  "uBright",
] as const;

/** How the light is tuned — the look, in one place. */
export const AMBIENT_LOOK = {
  /** how far up the screen the light reaches (0.46 = almost half) */
  depth: 0.46,
  /** how tall the wave on the top edge is */
  amp: 0.22,
  /** how many swells fit across the width */
  freq: 1.1,
  /** how fast the field moves (slow) */
  speed: 0.16,
  /** how much the noise is warped by other noise */
  warp: 1.4,
  /** how much the light leans to the right (1 = even) */
  bias: 0.34,
} as const;

/**
 * The shader is drawn into a small buffer and stretched by the browser.
 * The look is a soft gradient, so nobody can see the upscale — and the
 * cost stays the same on a cheap phone and on a laptop.
 */
export const AMBIENT_MAX_W = 420;
export const AMBIENT_MAX_H = 760;
