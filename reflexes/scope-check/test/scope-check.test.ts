import type { ToolCallContext } from "@agentreflex/core";
import { describe, expect, it } from "vitest";
import reflex from "../src/index.js";

const ctx = (over: Partial<ToolCallContext> = {}): ToolCallContext => ({
  event: "onToolCall",
  agent: "claude",
  tool: "Write",
  command: undefined,
  paths: ["src/auth/login.ts"],
  cwd: "/proj",
  raw: {},
  ...over,
});

describe("scope-check — no options", () => {
  it("passes when no options set", async () => {
    const result = await reflex.onToolCall?.(ctx());
    expect(result?.action).toBe("pass");
  });

  it("passes non-write tools unconditionally", async () => {
    const result = await reflex.onToolCall?.(ctx({ tool: "Bash", paths: [] }));
    expect(result?.action).toBe("pass");
  });

  it("passes Read tool unconditionally", async () => {
    const result = await reflex.onToolCall?.(ctx({ tool: "Read" }));
    expect(result?.action).toBe("pass");
  });
});

describe("scope-check — structural (allow list)", () => {
  it("passes a file within allowed glob", async () => {
    const result = await reflex.onToolCall?.(
      ctx({ paths: ["src/auth/login.ts"], options: { allow: ["src/auth/**"] } }),
    );
    expect(result?.action).toBe("pass");
  });

  it("denies a file outside allowed paths", async () => {
    const result = await reflex.onToolCall?.(
      ctx({ paths: ["src/settings/profile.ts"], options: { allow: ["src/auth/**"] } }),
    );
    expect(result?.action).toBe("deny");
    expect(result?.action === "deny" && result.reason).toMatch(/outside the allowed scope/);
  });

  it("passes when one of multiple patterns matches", async () => {
    const result = await reflex.onToolCall?.(
      ctx({
        paths: ["tests/auth/login.test.ts"],
        options: { allow: ["src/auth/**", "tests/auth/**"] },
      }),
    );
    expect(result?.action).toBe("pass");
  });

  it("denies when no pattern matches across multiple allowed paths", async () => {
    const result = await reflex.onToolCall?.(
      ctx({
        paths: ["src/payments/charge.ts"],
        options: { allow: ["src/auth/**", "tests/auth/**"] },
      }),
    );
    expect(result?.action).toBe("deny");
  });

  it("passes when paths is empty", async () => {
    const result = await reflex.onToolCall?.(
      ctx({ paths: [], options: { allow: ["src/auth/**"] } }),
    );
    expect(result?.action).toBe("pass");
  });

  it("passes with wildcard-only pattern", async () => {
    const result = await reflex.onToolCall?.(
      ctx({ paths: ["anywhere/deep/file.ts"], options: { allow: ["**"] } }),
    );
    expect(result?.action).toBe("pass");
  });

  it("passes an absolute path within cwd", async () => {
    const result = await reflex.onToolCall?.(
      ctx({
        paths: ["/proj/src/auth/token.ts"],
        cwd: "/proj",
        options: { allow: ["src/auth/**"] },
      }),
    );
    expect(result?.action).toBe("pass");
  });

  it("denies an absolute path outside cwd scope", async () => {
    const result = await reflex.onToolCall?.(
      ctx({
        paths: ["/proj/src/billing/invoice.ts"],
        cwd: "/proj",
        options: { allow: ["src/auth/**"] },
      }),
    );
    expect(result?.action).toBe("deny");
  });
});

describe("scope-check — string allow value (not array)", () => {
  it("passes when allow is a string that matches", async () => {
    const result = await reflex.onToolCall?.(
      ctx({ paths: ["src/auth/login.ts"], options: { allow: "src/auth/**" } }),
    );
    expect(result?.action).toBe("pass");
  });

  it("denies when allow is a string that does not match", async () => {
    const result = await reflex.onToolCall?.(
      ctx({ paths: ["src/billing/charge.ts"], options: { allow: "src/auth/**" } }),
    );
    expect(result?.action).toBe("deny");
    expect(result?.action === "deny" && result.reason).toMatch(/outside the allowed scope/);
  });
});

describe("scope-check — multiple paths", () => {
  it("passes when all paths are within allowed scope", async () => {
    const result = await reflex.onToolCall?.(
      ctx({
        paths: ["src/auth/login.ts", "src/auth/logout.ts"],
        options: { allow: ["src/auth/**"] },
      }),
    );
    expect(result?.action).toBe("pass");
  });

  it("denies when the second path is outside allowed scope", async () => {
    const result = await reflex.onToolCall?.(
      ctx({
        paths: ["src/auth/login.ts", "src/billing/charge.ts"],
        options: { allow: ["src/auth/**"] },
      }),
    );
    expect(result?.action).toBe("deny");
    expect(result?.action === "deny" && result.reason).toMatch(/src\/billing\/charge\.ts/);
  });

  it("denies when the first path is outside allowed scope", async () => {
    const result = await reflex.onToolCall?.(
      ctx({
        paths: ["src/billing/charge.ts", "src/auth/login.ts"],
        options: { allow: ["src/auth/**"] },
      }),
    );
    expect(result?.action).toBe("deny");
    expect(result?.action === "deny" && result.reason).toMatch(/src\/billing\/charge\.ts/);
  });
});

describe("scope-check — explicit empty allow (deny-all)", () => {
  it("denies all writes when allow is an empty array", async () => {
    const result = await reflex.onToolCall?.(
      ctx({ paths: ["src/auth/login.ts"], options: { allow: [] } }),
    );
    expect(result?.action).toBe("deny");
    expect(result?.action === "deny" && result.reason).toMatch(/allow list is empty/);
  });

  it("still passes non-write tools even with empty allow", async () => {
    const result = await reflex.onToolCall?.(
      ctx({ tool: "Read", paths: ["src/auth/login.ts"], options: { allow: [] } }),
    );
    expect(result?.action).toBe("pass");
  });

  it("denies writes with empty paths and empty allow", async () => {
    const result = await reflex.onToolCall?.(ctx({ paths: [], options: { allow: [] } }));
    expect(result?.action).toBe("pass");
  });
});
