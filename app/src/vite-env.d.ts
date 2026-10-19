/// <reference types="vite/client" />

// v4.3: optional app-level Gemini key (set in the deploy env, never in the
// repo). Declared explicitly so `tsc` accepts the access.
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
}
