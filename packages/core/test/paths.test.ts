import { describe, expect, it } from "vitest";
import { pathMatchesGlob } from "../src/paths.js";

const cwd = "/proj";

describe("pathMatchesGlob", () => {
  it("matches everything under a trailing globstar, including zero segments", () => {
    expect(pathMatchesGlob("src/auth/login.ts", ["src/auth/**"], cwd)).toBe(true);
    expect(pathMatchesGlob("src/auth/a/b/c.ts", ["src/auth/**"], cwd)).toBe(true);
    expect(pathMatchesGlob("src/auth", ["src/auth/**"], cwd)).toBe(true);
    expect(pathMatchesGlob("src/settings/profile.ts", ["src/auth/**"], cwd)).toBe(false);
  });

  it("matches zero or more segments for an interior globstar", () => {
    expect(pathMatchesGlob("src/index.ts", ["src/**/index.ts"], cwd)).toBe(true);
    expect(pathMatchesGlob("src/a/b/index.ts", ["src/**/index.ts"], cwd)).toBe(true);
    expect(pathMatchesGlob("index.ts", ["**/*.ts"], cwd)).toBe(true);
    expect(pathMatchesGlob("a/b/x.ts", ["**/*.ts"], cwd)).toBe(true);
  });

  it("keeps * within one segment", () => {
    expect(pathMatchesGlob("src/auth/login.ts", ["src/auth/*.ts"], cwd)).toBe(true);
    expect(pathMatchesGlob("src/auth/deep/login.ts", ["src/auth/*.ts"], cwd)).toBe(false);
  });

  it("treats ? as exactly one character, never as a regex quantifier", () => {
    expect(pathMatchesGlob("config1.json", ["config?.json"], cwd)).toBe(true);
    expect(pathMatchesGlob("confi.json", ["config?.json"], cwd)).toBe(false);
    expect(pathMatchesGlob("configxx.json", ["config?.json"], cwd)).toBe(false);
    // a leading ? must not blow up regex compilation
    expect(pathMatchesGlob("xfoo.ts", ["?foo.ts"], cwd)).toBe(true);
  });

  it("escapes regex metacharacters in patterns", () => {
    expect(pathMatchesGlob("a+b(c).ts", ["a+b(c).ts"], cwd)).toBe(true);
    expect(pathMatchesGlob("axb.ts", ["a+b(c).ts"], cwd)).toBe(false);
  });

  it("never matches paths that resolve outside cwd, however broad the glob", () => {
    expect(pathMatchesGlob("../escape.ts", ["**"], cwd)).toBe(false);
    expect(pathMatchesGlob("/etc/passwd", ["**"], cwd)).toBe(false);
    expect(pathMatchesGlob("src/../../up.ts", ["**"], cwd)).toBe(false);
  });

  it("accepts absolute paths inside cwd and normalizes separators", () => {
    expect(pathMatchesGlob("/proj/src/auth/token.ts", ["src/auth/**"], cwd)).toBe(true);
    expect(pathMatchesGlob("src/auth/x.ts", ["src\\auth\\**"], cwd)).toBe(true);
  });

  it("tolerates a scalar glob and ./-prefixed patterns", () => {
    expect(pathMatchesGlob("src/a.ts", "src/**", cwd)).toBe(true);
    expect(pathMatchesGlob("src/a.ts", ["./src/**"], cwd)).toBe(true);
  });

  it("matches nothing on an empty pattern list", () => {
    expect(pathMatchesGlob("src/a.ts", [], cwd)).toBe(false);
  });
});
