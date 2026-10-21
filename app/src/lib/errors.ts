// The one error the AI can fail with (v4.13).
//
// It lives in its own file so the streaming reader can throw it
// without importing the whole Gemini client — the two would otherwise
// import each other.
export type GeminiFailure =
  | "no-key"
  | "invalid-key"
  | "quota"
  | "network"
  | "blocked"
  | "unknown";

export class GeminiError extends Error {
  code: GeminiFailure;
  constructor(code: GeminiFailure, message: string) {
    super(message);
    this.code = code;
  }
}
