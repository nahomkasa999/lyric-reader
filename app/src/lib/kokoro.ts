// The HD voice engine (v4.8): Kokoro-82M, running on the phone.
//
// Kokoro is small enough to live on a phone (82M parameters, ~86 MB as q8),
// so the whole engine can be downloaded once and then run offline — no
// server, no cost, no waiting. The browser's own speech engine stays as
// the fallback: it always works, but it sounds like a phone.
//
// The model files are cached by transformers.js in the browser's Cache
// Storage ("transformers-cache"), so the download happens ONCE. The app
// never starts it behind the user's back — the sheet asks first.

export { KOKORO_VOICES, DEFAULT_VOICE } from "./kokoroVoices";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const CACHE = "transformers-cache";

export interface LoadProgress {
  /** 0 – 100 */
  percent: number;
  /** what the engine is doing right now */
  label: string;
  /** megabytes downloaded so far */
  mb: number;
}

/** The engine as it is loaded — the type is only known after the import. */
type Tts = {
  generate: (
    text: string,
    opts?: { voice?: string; speed?: number },
  ) => Promise<{ audio: Float32Array; sampling_rate: number }>;
};

let model: Tts | null = null;
let loading: Promise<Tts> | null = null;

/**
 * WebGPU is much faster, but `navigator.gpu` existing does not mean it
 * works — a browser can expose the API with no adapter behind it. So we
 * ask for a real adapter before we promise anything.
 */
export async function webgpuAvailable(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const gpu = (
    navigator as {
      gpu?: { requestAdapter: () => Promise<unknown> };
    }
  ).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/** Can this phone run the HD engine at all? */
export function kokoroSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof WebAssembly !== "object") return false;
  return true;
}

/** Is the engine already on the phone? (the weights live in Cache Storage) */
export async function kokoroInstalled(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    return keys.some((r) => r.url.includes("Kokoro-82M"));
  } catch {
    return false;
  }
}

/** Throw the engine away — the user wants their space back. */
export async function removeKokoro(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter((r) => r.url.includes("Kokoro-82M"))
        .map((r) => cache.delete(r)),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Load the engine — downloading it the first time, reading it from the
 * cache every time after that.
 */
export function loadKokoro(
  onProgress?: (p: LoadProgress) => void,
): Promise<Tts> {
  if (model) return Promise.resolve(model);
  if (loading) return loading;
  const files = new Map<string, { loaded: number; total: number }>();
  const report = (label: string) => {
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    onProgress?.({
      percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
      label,
      mb: Math.round(loaded / 1024 / 1024),
    });
  };
  loading = (async () => {
    const { KokoroTTS, env } = await import("kokoro-js");
    // The ONNX runtime comes from our own origin (scripts/copy-ort.mjs
    // puts it in public/ort) — not from a CDN, so the voice works even
    // when the CDN is blocked or slow.
    try {
      env.wasmPaths = `${import.meta.env.BASE_URL}ort/`;
    } catch {
      /* the runtime will use its default location */
    }
    const device = (await webgpuAvailable()) ? "webgpu" : "wasm";
    const options = {
      dtype: "q8" as const,
      progress_callback: (info: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (info.file) {
          const prev = files.get(info.file);
          files.set(info.file, {
            loaded: info.loaded ?? prev?.loaded ?? 0,
            total: info.total ?? prev?.total ?? 0,
          });
        }
        report(info.status === "download" ? "Downloading" : "Preparing");
      },
    };
    let tts: Tts;
    try {
      tts = (await KokoroTTS.from_pretrained(MODEL, {
        ...options,
        device,
      })) as unknown as Tts;
    } catch (e) {
      // WebGPU said yes but the engine could not start — WASM always can.
      if (device !== "webgpu") throw e;
      tts = (await KokoroTTS.from_pretrained(MODEL, {
        ...options,
        device: "wasm",
      })) as unknown as Tts;
    }
    model = tts as unknown as Tts;
    report("Ready");
    return model;
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** True while the engine is loaded and ready. */
export function kokoroReady(): boolean {
  return model !== null;
}

/** Say a text with the HD engine: generate the sound, then play it. */
export async function speakKokoro(
  text: string,
  voice: string,
  speed: number,
  onProgress?: (p: LoadProgress) => void,
): Promise<void> {
  const tts = await loadKokoro(onProgress);
  const raw = await tts.generate(text, {
    voice,
    speed: Math.min(2, Math.max(0.5, speed)),
  });
  await playSamples(raw.audio, raw.sampling_rate);
}

let ctx: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;

function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** Stop whatever the HD engine is playing. */
export function stopKokoroAudio(): void {
  if (source) {
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    source = null;
  }
}

/** Play generated samples; resolves when the sound ends. */
export function playSamples(
  samples: Float32Array,
  sampleRate: number,
): Promise<void> {
  return new Promise((resolve) => {
    stopKokoroAudio();
    const ac = audioContext();
    if (ac.state === "suspended") void ac.resume();
    const buffer = ac.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(ac.destination);
    src.onended = () => {
      if (source === src) source = null;
      resolve();
    };
    source = src;
    src.start();
  });
}
