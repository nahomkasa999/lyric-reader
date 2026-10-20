// The glow on a canvas: with a WebGL context the shader path runs.
//
// The fake context below records what the renderer does, so the test can
// check that the shader is built, the uniforms are the recipe's numbers
// and frames are drawn.
import { describe, it, expect, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createElement } from "react";
import AmbientCanvas from "../src/components/AmbientCanvas";
import { AMBIENT_LOOK } from "../src/lib/ambientShader";
import { gainFor, hexToHue, tones } from "../src/lib/ambient";

/** The hue of a colour the shader was given, in degrees. */
function hueOf(c: number[]): number {
  const [r, g, b] = c;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  if (max === r) return ((g - b) / d + (g < b ? 6 : 0)) * 60;
  if (max === g) return ((b - r) / d + 2) * 60;
  return ((r - g) / d + 4) * 60;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface Fake {
  uniforms: Record<string, number[]>;
  draws: number;
  programs: number;
}

function fakeGL(): Fake {
  const state: Fake = { uniforms: {}, draws: 0, programs: 0 };
  const loc = (name: string) => ({ name });
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    deleteShader: () => {},
    createProgram: () => {
      state.programs += 1;
      return {};
    },
    attachShader: () => {},
    bindAttribLocation: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    deleteProgram: () => {},
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    useProgram: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    getUniformLocation: (_p: unknown, name: string) => loc(name),
    uniform1f: (l: { name: string } | null, v: number) => {
      if (l) state.uniforms[l.name] = [v];
    },
    uniform2f: (l: { name: string } | null, a: number, b: number) => {
      if (l) state.uniforms[l.name] = [a, b];
    },
    uniform3f: (l: { name: string } | null, a: number, b: number, c: number) => {
      if (l) state.uniforms[l.name] = [a, b, c];
    },
    viewport: () => {},
    drawArrays: () => {
      state.draws += 1;
    },
    deleteBuffer: () => {},
    getExtension: () => null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__fakeGL = gl;
  return state;
}

const original = HTMLCanvasElement.prototype.getContext;

// The renderer only draws once the canvas has a size, and happy-dom has
// no layout — so the test gives the canvas one.
function withSize(w: number, h: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => w,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => h,
  });
}

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = original;
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

async function mount(
  props: {
    mode?: "alternate" | "single";
    color?: string;
    intensity?: number;
    motion?: boolean;
  } = {},
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(AmbientCanvas, {
        mode: props.mode ?? "alternate",
        color: props.color ?? "#A6E22E",
        intensity: props.intensity ?? 60,
        motion: props.motion ?? false,
      }),
    );
  });
  return { container, root };
}

describe("the glow on a canvas", () => {
  it("draws the shader with the recipe's numbers", async () => {
    withSize(390, 844);
    const state = fakeGL();
    HTMLCanvasElement.prototype.getContext = (() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__fakeGL) as never;

    const { container, root } = await mount({ intensity: 60 });

    // The canvas is on screen, not the CSS fallback.
    expect(container.querySelector('[data-testid="ambient-canvas"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ambient-haze"]')).toBeNull();

    // The program was built and a frame was drawn.
    expect(state.programs).toBe(1);
    expect(state.draws).toBeGreaterThan(0);

    // The look: how far the light reaches and how strong it is.
    expect(state.uniforms.uDepth[0]).toBeCloseTo(AMBIENT_LOOK.depth, 3);
    expect(state.uniforms.uGain[0]).toBeCloseTo(gainFor(60), 3);
    expect(state.uniforms.uBias[0]).toBeCloseTo(AMBIENT_LOOK.bias, 3);

    // The colours: the green the cycle starts on.
    const main = tones(120).main;
    expect(state.uniforms.uMain[0]).toBeCloseTo(main[0], 3);
    expect(state.uniforms.uMain[1]).toBeCloseTo(main[1], 3);

    await act(async () => root.unmount());
  });

  it("holds the picked colour in one colour mode", async () => {
    withSize(390, 844);
    const state = fakeGL();
    HTMLCanvasElement.prototype.getContext = (() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__fakeGL) as never;

    const { root } = await mount({ mode: "single" });
    // The glow carries the hue of the picked colour.
    expect(hueOf(state.uniforms.uMain)).toBeCloseTo(hexToHue("#A6E22E"), 0);
    await act(async () => root.unmount());
  });

  it("falls back to the CSS haze without WebGL", async () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    const { container, root } = await mount();
    expect(container.querySelector('[data-testid="ambient-haze"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ambient-canvas"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
