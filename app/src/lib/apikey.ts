// The user's own Gemini API key, stored on this phone only.
// Never baked into the build; never logged; sent only to
// generativelanguage.googleapis.com (see lib/gemini.ts).
const KEY = "lr-gemini-key";

export function getApiKey(): string {
  try {
    return (localStorage.getItem(KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function setApiKey(k: string): void {
  try {
    localStorage.setItem(KEY, k.trim());
  } catch {
    /* private mode: the key just won't persist */
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}
