// Copies the ONNX Runtime (the engine behind the HD voice) from npm into
// public/ort, so the phone fetches it from our own origin instead of a
// CDN. Two builds ship: the JSEP one (WebGPU, when the phone has it)
// and the plain WASM one (every other phone).
//
// The model weights come from Hugging Face and are cached by the browser
// after the first download; the runtime is cached the same way.
//
// Runs as `prebuild` before every `vite build`, locally and on Vercel.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(appRoot, "public", "ort");
mkdirSync(out, { recursive: true });

const ort = join(appRoot, "node_modules", "onnxruntime-web", "dist");

const copies = [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

for (const name of copies) {
  copyFileSync(join(ort, name), join(out, name));
  console.log("ort:", name);
}
