import { describe, expect, it } from "vitest";
import { interpolate, parsePackManifest, referencedSecrets } from "../src/pack.js";

const MANIFEST = JSON.stringify({
  name: "memcell",
  version: "0.1.0",
  secrets: { memcell_token: { title: "MemCell token", required: true } },
  options: { memcell_url: { title: "endpoint", default: "https://api.memcell.ai/mcp" } },
  mcp: {
    memcell: {
      type: "http",
      url: "${options.memcell_url}",
      headers: { Authorization: "Bearer ${secrets.memcell_token}" },
    },
  },
  skills: [{ name: "memcell-memory", source: "skills/memcell-memory" }],
  hooks: [{ event: "SessionStart", run: "hooks/session-context.mjs" }],
});

describe("parsePackManifest", () => {
  it("parses a full manifest", () => {
    const m = parsePackManifest(MANIFEST);
    expect(m.name).toBe("memcell");
    expect(m.mcp?.memcell?.type).toBe("http");
    expect(m.skills?.[0]?.name).toBe("memcell-memory");
    expect(m.hooks?.[0]?.event).toBe("SessionStart");
  });

  it("rejects invalid JSON, bad names, and escapes", () => {
    expect(() => parsePackManifest("{nope")).toThrow(/valid JSON/);
    expect(() => parsePackManifest(JSON.stringify({ name: "Bad Name" }))).toThrow(/kebab-case/);
    expect(() =>
      parsePackManifest(
        JSON.stringify({ name: "x", skills: [{ name: "s", source: "../../etc" }] }),
      ),
    ).toThrow(/inside the pack/);
    expect(() =>
      parsePackManifest(
        JSON.stringify({ name: "x", hooks: [{ event: "PreCompact", run: "h.mjs" }] }),
      ),
    ).toThrow(/SessionStart \| UserPromptSubmit \| Stop \| SessionEnd/);
    // the full lifecycle: seed, per-prompt, per-response, close
    expect(
      parsePackManifest(
        JSON.stringify({
          name: "x",
          hooks: [
            { event: "Stop", run: "capture.mjs", timeout: 30 },
            { event: "SessionEnd", run: "close.mjs", timeout: 30 },
          ],
        }),
      ).hooks,
    ).toHaveLength(2);
    expect(() =>
      parsePackManifest(JSON.stringify({ name: "x", mcp: { s: { type: "stdio", url: "u" } } })),
    ).toThrow(/only type "http"/);
  });
});

describe("interpolate", () => {
  const values = {
    secrets: { memcell_token: "tok-123" },
    options: { memcell_url: "http://localhost:8000/mcp" },
  };

  it("substitutes secrets and options", () => {
    expect(interpolate("Bearer ${secrets.memcell_token}", values)).toBe("Bearer tok-123");
    expect(interpolate("${options.memcell_url}", values)).toBe("http://localhost:8000/mcp");
  });

  it("throws loudly on unknown references — never emits a literal ${...}", () => {
    expect(() => interpolate("${secrets.nope}", values)).toThrow(/no value was provided/);
  });
});

describe("referencedSecrets", () => {
  it("finds only the secrets the mcp block actually uses", () => {
    const m = parsePackManifest(MANIFEST);
    expect(referencedSecrets(m)).toEqual(["memcell_token"]);
  });

  it("skips declared-but-unused secrets", () => {
    const m = parsePackManifest(
      JSON.stringify({
        name: "x",
        secrets: { unused: { title: "u" } },
        mcp: { s: { type: "http", url: "https://x.dev/mcp" } },
      }),
    );
    expect(referencedSecrets(m)).toEqual([]);
  });
});
