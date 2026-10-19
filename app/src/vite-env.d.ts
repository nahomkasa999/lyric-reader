/// <reference types="vite/client" />

// v4.3: optional app-level Gemini key (set in the deploy env, never in the
// repo). Declared explicitly so `tsc` accepts the access.
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
}

// v4.6: build stamp (see vite.config.ts define). Shown in Settings so a
// screenshot always identifies the running build.
declare const __BUILD_ID__: string;
