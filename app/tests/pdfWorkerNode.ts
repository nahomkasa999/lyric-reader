// Node/happy-dom substitute for src/lib/pdfWorker.ts (no Web Worker here).
// The legacy build runs pdf.js on the main thread.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export { pdfjsLib };
