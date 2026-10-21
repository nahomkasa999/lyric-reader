// The user's own Gemini API key, stored on this phone only.
// Never baked into the build; never logged; sent only to
// generativelanguage.googleapis.com (see lib/gemini.ts).
const KEY = "lr-gemini-key";
/**
 * A second key (v4.13).
 *
 * The free tier is a quota per project per minute and per day, and a
 * rate limit says nothing about the key being wrong — it says the
 * project is busy. A reader with two keys should not have to wait for
 * the window to open: the second one is tried when the first is
 * throttled.
 */
const KEY2 = "lr-gemini-key-2";

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

export function removeApiKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The reader's second key — the spare for a rate limit. */
export function getSecondApiKey(): string {
  try {
    return (localStorage.getItem(KEY2) ?? "").trim();
  } catch {
    return "";
  }
}

export function setSecondApiKey(k: string): void {
  try {
    localStorage.setItem(KEY2, k.trim());
  } catch {
    /* private mode: the key just won't persist */
  }
}

export function removeSecondApiKey(): void {
  try {
    localStorage.removeItem(KEY2);
  } catch {
    /* ignore */
  }
}

/**
 * v4.3: app-level key via build env. Nahom's decision (Oct 19) — meanings
 * and Ask work with zero setup. The key itself lives ONLY in the deploy
 * environment (Vercel env vars); it is NEVER in this repo. It ships inside
 * the public web bundle, so it is extractable by anyone who downloads it —
 * revisit this if the app spreads widely or the key's quota gets abused.
 */
export function getEnvApiKey(): string {
  try {
    const v = (import.meta.env?.VITE_GEMINI_API_KEY ?? "") as string;
    return v.trim();
  } catch {
    return "";
  }
}

/**
 * The key actually used for AI calls: the user's personal key wins over the
 * app-level env key; empty string when neither is set. All call sites must
 * use this, never getApiKey() directly.
 */
export function getEffectiveApiKey(): string {
  return getApiKey() || getEnvApiKey();
}

/**
 * Every key to try, in order.
 *
 * The reader's own keys come first — one, or two when they pasted a
 * spare. The app-level key is the last resort: it is shared by everyone
 * who downloads the app, so its quota is everybody's.
 */
export function getApiKeys(): string[] {
  const own = [getApiKey(), getSecondApiKey()].filter((k) => k.length > 0);
  if (own.length) return own;
  const env = getEnvApiKey();
  return env ? [env] : [];
}

/** Is the reader using their own key, or the app's shared one? */
export function usingOwnKey(): boolean {
  return getApiKey().length > 0;
}

export function hasApiKey(): boolean {
  return getEffectiveApiKey().length > 0;
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
