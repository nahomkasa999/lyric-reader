import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractKeyFromHash,
  getEffectiveApiKey,
  getEnvApiKey,
  hasApiKey,
  removeApiKey,
  setApiKey,
} from "../src/lib/apikey";

describe("extractKeyFromHash", () => {
  it("extracts the key from a #k= fragment", () => {
    expect(extractKeyFromHash("#k=test-key-alpha-0001")).toBe(
      "test-key-alpha-0001",
    );
  });

  it("extracts dotted auth-style keys too", () => {
    expect(extractKeyFromHash("#k=test.key.with.dots-0002")).toBe(
      "test.key.with.dots-0002",
    );
  });

  it("handles extra fragment params and URL-encoding", () => {
    expect(extractKeyFromHash("#foo=1&k=secret-key-value")).toBe(
      "secret-key-value",
    );
    expect(extractKeyFromHash("#k=key%20with%20spaces")).toBe(
      "key with spaces",
    );
  });

  it("ignores missing, empty, or suspiciously short values", () => {
    expect(extractKeyFromHash("")).toBeNull();
    expect(extractKeyFromHash("#foo=1")).toBeNull();
    expect(extractKeyFromHash("#k=")).toBeNull();
    expect(extractKeyFromHash("#k=abc")).toBeNull(); // too short — never nuke a good key
  });
});

describe("key resolution (v4.3): personal key > env key > none", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("prefers the personal key over the env key", () => {
    vi.stubEnv("VITE_GEMINI_API_KEY", "test-env-key-0001");
    setApiKey("test-personal-key-0001");
    expect(getEnvApiKey()).toBe("test-env-key-0001");
    expect(getEffectiveApiKey()).toBe("test-personal-key-0001");
    expect(hasApiKey()).toBe(true);
  });

  it("uses the env key when no personal key is set", () => {
    vi.stubEnv("VITE_GEMINI_API_KEY", "test-env-key-0001");
    expect(getEffectiveApiKey()).toBe("test-env-key-0001");
    expect(hasApiKey()).toBe(true);
  });

  it("reports no key when neither is set", () => {
    expect(getEffectiveApiKey()).toBe("");
    expect(hasApiKey()).toBe(false);
  });

  it("removeApiKey falls back to the env key", () => {
    vi.stubEnv("VITE_GEMINI_API_KEY", "test-env-key-0001");
    setApiKey("test-personal-key-0001");
    removeApiKey();
    expect(getEffectiveApiKey()).toBe("test-env-key-0001");
  });

  it("ignores a blank env value", () => {
    vi.stubEnv("VITE_GEMINI_API_KEY", "   ");
    expect(getEffectiveApiKey()).toBe("");
    expect(hasApiKey()).toBe(false);
  });
});
