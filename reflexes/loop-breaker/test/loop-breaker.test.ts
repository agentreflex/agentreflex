import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolResultContext } from "@agentreflex/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import reflex from "../src/index.js";

let stateDir: string;

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "loop-breaker-test-"));
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

const ctx = (over: Partial<ToolResultContext> = {}): ToolResultContext => ({
  event: "onToolResult",
  agent: "claude",
  tool: "Bash",
  command: "npm test",
  paths: [],
  cwd: "/proj",
  raw: {},
  output: "1 test failing: expected 2 to be 3",
  options: { stateDir },
  ...over,
});

const run = (over: Partial<ToolResultContext> = {}) => reflex.onToolResult?.(ctx(over));

describe("loop-breaker — catch", () => {
  it("injects after the same command + output repeats 3 times (default threshold)", async () => {
    expect((await run())?.action).toBe("none");
    expect((await run())?.action).toBe("none");
    const third = await run();
    expect(third?.action).toBe("inject");
    expect(third?.action === "inject" && third.context).toMatch(/3 times/);
    expect(third?.action === "inject" && third.context).toMatch(/different approach/);
  });

  it("keeps injecting past the threshold", async () => {
    await run();
    await run();
    await run();
    const fourth = await run();
    expect(fourth?.action).toBe("inject");
    expect(fourth?.action === "inject" && fourth.context).toMatch(/4 times/);
  });

  it("honors a configured threshold", async () => {
    const opts = { stateDir, threshold: 2 };
    expect((await run({ options: opts }))?.action).toBe("none");
    expect((await run({ options: opts }))?.action).toBe("inject");
  });
});

describe("loop-breaker — non-catch", () => {
  it("does not fire for distinct commands", async () => {
    expect((await run({ command: "npm test -- a" }))?.action).toBe("none");
    expect((await run({ command: "npm test -- b" }))?.action).toBe("none");
    expect((await run({ command: "npm test -- c" }))?.action).toBe("none");
  });

  it("does not fire when the same command produces different output", async () => {
    expect((await run({ output: "err A" }))?.action).toBe("none");
    expect((await run({ output: "err B" }))?.action).toBe("none");
    expect((await run({ output: "err C" }))?.action).toBe("none");
  });

  it("ignores non-Bash tools", async () => {
    for (let i = 0; i < 4; i++) {
      expect((await run({ tool: "Write" }))?.action).toBe("none");
    }
  });

  it("ignores Bash results with no command", async () => {
    expect((await run({ command: undefined }))?.action).toBe("none");
  });

  it("forgets repeats outside the sliding window", async () => {
    // Two old entries beyond a 1-minute window, then a fresh one: no inject.
    const opts = { stateDir, windowMinutes: 1 };
    await run({ options: opts });
    await run({ options: opts });
    const file = fs
      .readdirSync(stateDir)
      .map((f) => path.join(stateDir, f))
      .find((f) => f.includes("loop-breaker"));
    expect(file).toBeDefined();
    const entries = JSON.parse(fs.readFileSync(file as string, "utf8")) as Array<{
      fingerprint: string;
      at: number;
    }>;
    const aged = entries.map((e) => ({ ...e, at: e.at - 2 * 60_000 }));
    fs.writeFileSync(file as string, JSON.stringify(aged));
    expect((await run({ options: opts }))?.action).toBe("none");
  });

  it("keeps state per project cwd", async () => {
    await run({ cwd: "/proj-a" });
    await run({ cwd: "/proj-a" });
    // Third run in a different cwd starts its own count.
    expect((await run({ cwd: "/proj-b" }))?.action).toBe("none");
  });
});
