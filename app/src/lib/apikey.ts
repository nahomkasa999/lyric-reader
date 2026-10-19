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

/**
 * One-tap setup links: an app URL like `.../#k=<key>` stores the pasted key
 * on first load. Pure and unit-tested. Accepts anything a user could have
 * pasted — standard (AIza…) or auth (AQ…) keys — but ignores empty/short
 * values so stray fragments never nuke a good stored key.
 */
export function extractKeyFromHash(hash: string): string | null {
  try {
    const h = hash.startsWith("#") ? hash.slice(1) : hash;
    const k = new URLSearchParams(h).get("k");
    if (!k) return null;
    const v = k.trim();
    return v.length >= 8 ? v : null;
  } catch {
    return null;
  }
}
