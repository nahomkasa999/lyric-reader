import { describe, expect, it } from "vitest";
import { extractKeyFromHash } from "../src/lib/apikey";

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
