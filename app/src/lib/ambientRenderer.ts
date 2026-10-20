// The ambient glow, drawn by a small WebGL shader.
//
// This module is the engine: it opens the context, builds the program,
// keeps the clock and draws the frames. The React side (components/
// AmbientCanvas.tsx) only tells it what to draw and when to move.
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

import {
  AMBIENT_FRAGMENT,
  AMBIENT_LOOK,
  AMBIENT_MAX_H,
  AMBIENT_MAX_W,
  AMBIENT_UNIFORMS,
  AMBIENT_VERTEX,
} from "./ambientShader";
import { palette, type AmbientMode, type Rgb } from "./ambient";

type GL = WebGLRenderingContext;

/** What the renderer needs to know for one frame. */
export interface Frame {
  mode: AmbientMode;
  color: string;
  intensity: number;
}

/** The live renderer: it draws, it moves, and it lets go of the GPU. */
export interface Renderer {
  /** true when the light moves; false freezes it where it is */
  setMotion(on: boolean): void;
  /** draw one frame right now */
  draw(): void;
  destroy(): void;
}

/** A plain, cheap context: no alpha, no depth, no antialiasing. */
const GL_ATTRS: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: "low-power",
};

/** The WebGL context, or null when the device has none. */
export function getContext(canvas: HTMLCanvasElement): GL | null {
  try {
    return canvas.getContext("webgl", GL_ATTRS) as GL | null;
  } catch {
    return null;
  }
}

function compile(gl: GL, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** The program, or null when it will not build. */
function buildProgram(gl: GL): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, AMBIENT_VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, AMBIENT_FRAGMENT);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Open the shader on a canvas. Returns null when the device has no
 * WebGL or the shader will not build — the caller then draws the CSS
 * fallback instead.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  frame: () => Frame,
): Renderer | null {
  const gl = getContext(canvas);
  if (!gl) return null;
  const program = buildProgram(gl);
  if (!program) return null;
  const buffer = gl.createBuffer();
  if (!buffer) return null;

  // One full-screen triangle: three vertices, no index buffer.
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.useProgram(program);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const locs: Record<string, WebGLUniformLocation | null> = {};
  for (const name of AMBIENT_UNIFORMS) {
    locs[name] = gl.getUniformLocation(program, name);
  }
  const set1f = (name: string, v: number) => gl.uniform1f(locs[name], v);
  const set3f = (name: string, v: Rgb) =>
    gl.uniform3f(locs[name], v[0], v[1], v[2]);

  // The buffer stays small: the look is soft, so the upscale is invisible
  // and the cost is the same on a cheap phone and on a laptop. The size is
  // only set once the element has been laid out — resizing a canvas after
  // it has been painted leaves a stale tile behind on some browsers.
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    const scale = Math.min(1, AMBIENT_MAX_W / w, AMBIENT_MAX_H / h);
    const bw = Math.max(2, Math.round(w * scale));
    const bh = Math.max(2, Math.round(h * scale));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      gl.viewport(0, 0, bw, bh);
    }
    return true;
  };

  let elapsed = 0;

  const draw = () => {
    if (!resize()) return;
    const f = frame();
    const p = palette({
      mode: f.mode,
      color: f.color,
      intensity: f.intensity,
      elapsed,
    });
    gl.useProgram(program);
    gl.uniform2f(locs.uRes, canvas.width, canvas.height);
    set1f("uTime", elapsed);
    set1f("uDepth", AMBIENT_LOOK.depth);
    set1f("uAmp", AMBIENT_LOOK.amp);
    set1f("uFreq", AMBIENT_LOOK.freq);
    set1f("uSpeed", AMBIENT_LOOK.speed);
    set1f("uWarp", AMBIENT_LOOK.warp);
    set1f("uGain", p.gain);
    set1f("uBias", AMBIENT_LOOK.bias);
    set3f("uDeep", p.deep);
    set3f("uMain", p.main);
    set3f("uBright", p.bright);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let raf = 0;
  let last = 0;
  let running = false;
  let wanted = true;

  const loop = (now: number) => {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    elapsed += dt;
    draw();
    raf = requestAnimationFrame(loop);
  };

  const start = () => {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  };

  const stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  // A hidden tab has no business animating.
  const onVisibility = () => {
    if (document.hidden) stop();
    else if (wanted) start();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => draw())
      : null;
  observer?.observe(canvas);

  return {
    setMotion: (on: boolean) => {
      wanted = on;
      if (on) {
        start();
        return;
      }
      stop();
      draw();
    },
    draw,
    destroy: () => {
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
