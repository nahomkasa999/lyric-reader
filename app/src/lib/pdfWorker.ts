// Browser-only pdf.js worker wiring. Kept separate so Node-based tests can
// substitute the legacy build (see tests/pdfWorkerNode.ts + vitest alias).
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
