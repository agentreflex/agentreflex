import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { claude } from "../src/claude.js";
import { gemini } from "../src/gemini.js";
import { getAdapter, resolveAdapters } from "../src/index.js";
import { opencode } from "../src/opencode.js";
import { windsurf } from "../src/windsurf.js";

function inTmp<T>(fn: () => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ar-ad-"));
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("claude adapter", () => {
  it("parses a Bash payload into canonical context", () => {
    const c = claude.parse({ tool_name: "Bash", tool_input: { command: "git push" }, cwd: "/p" });
    expect(c).toMatchObject({ agent: "claude", tool: "Bash", command: "git push", cwd: "/p" });
  });

  it("formats deny as PreToolUse stdout, pass as empty", () => {
    const out = JSON.parse(claude.format({ action: "deny", reason: "no" }).stdout ?? "{}");
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(claude.format({ action: "pass" })).toEqual({});
  });

  it("install then uninstall round-trips the project hook", () => {
    inTmp(() => {
      expect(claude.install("project").changed).toBe(true);
      const f = path.join(process.cwd(), ".claude", "settings.json");
      expect(fs.readFileSync(f, "utf8")).toContain("hook --agent claude");
      expect(claude.uninstall("project").changed).toBe(true);
      expect(fs.readFileSync(f, "utf8")).not.toContain("hook --agent");
    });
  });

  it("installs PreToolUse, PostToolUse, and PostToolUseFailure hooks", () => {
    inTmp(() => {
      claude.install("project");
      const f = path.join(process.cwd(), ".claude", "settings.json");
      const settings = JSON.parse(fs.readFileSync(f, "utf8"));
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(settings.hooks.PostToolUse).toHaveLength(1);
      expect(settings.hooks.PostToolUseFailure).toHaveLength(1);
      // idempotent: a second install changes nothing
      expect(claude.install("project").changed).toBe(false);
      // uninstall clears every event
      claude.uninstall("project");
      const after = JSON.parse(fs.readFileSync(f, "utf8"));
      expect(after.hooks.PreToolUse).toEqual([]);
      expect(after.hooks.PostToolUse).toEqual([]);
      expect(after.hooks.PostToolUseFailure).toEqual([]);
    });
  });

  it("parses PostToolUseFailure as a failed tool result", () => {
    const c = claude.parse({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      tool_response: { stderr: "connection refused", error: "exit code 1" },
      cwd: "/p",
    });
    expect(c).toMatchObject({
      event: "onToolResult",
      output: "connection refused\nexit code 1",
      success: false,
    });
  });

  it("reads the top-level error field when PostToolUseFailure has no tool_response", () => {
    // Real captured shape: failures carry `error` top-level, no tool_response.
    const c = claude.parse({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "node -e \"process.exit(1)\"" },
      error: "Exit code 1\nconnection refused",
      is_interrupt: false,
      cwd: "/p",
    });
    expect(c).toMatchObject({
      event: "onToolResult",
      output: "Exit code 1\nconnection refused",
      success: false,
    });
  });

  it("echoes PostToolUseFailure in the inject response for failure events", () => {
    const ctx = claude.parse({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      tool_response: { stderr: "boom" },
      cwd: "/p",
    });
    expect(ctx.event).toBe("onToolResult");
    const res = claude.formatResult?.(
      { action: "inject", context: "step back" },
      ctx.event === "onToolResult" ? ctx : undefined,
    );
    const out = JSON.parse(res?.stdout ?? "{}");
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure");
  });

  it("parses a PostToolUse payload into a tool-result context", () => {
    const c = claude.parse({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      tool_response: { stdout: "1 failing", stderr: "ERR!" },
      cwd: "/p",
    });
    expect(c).toMatchObject({
      event: "onToolResult",
      tool: "Bash",
      command: "npm test",
      output: "1 failing\nERR!",
    });
  });

  it("parses a string tool_response as output", () => {
    const c = claude.parse({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_response: "file contents",
    });
    expect(c).toMatchObject({ event: "onToolResult", output: "file contents" });
  });

  it("still parses PreToolUse payloads (no hook_event_name) as tool calls", () => {
    const c = claude.parse({ tool_name: "Bash", tool_input: { command: "ls" } });
    expect(c.event).toBe("onToolCall");
  });

  it("formats inject as PostToolUse additionalContext", () => {
    const res = claude.formatResult?.({ action: "inject", context: "step back" });
    const out = JSON.parse(res?.stdout ?? "{}");
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.additionalContext).toBe("step back");
  });

  it("formats block as a decision, and none as empty", () => {
    const res = claude.formatResult?.({ action: "block", reason: "bad result" });
    expect(JSON.parse(res?.stdout ?? "{}")).toEqual({ decision: "block", reason: "bad result" });
    expect(claude.formatResult?.({ action: "none" })).toEqual({});
  });
});

describe("decision dialects", () => {
  it("gemini denies via stdout and has no native ask", () => {
    expect(JSON.parse(gemini.format({ action: "deny", reason: "x" }).stdout ?? "{}").decision).toBe(
      "deny",
    );
    expect(gemini.format({ action: "ask", reason: "x" })).toEqual({});
  });

  it("windsurf blocks via exit code 2 + stderr", () => {
    expect(windsurf.format({ action: "deny", reason: "x" })).toEqual({ stderr: "x", exit: 2 });
  });

  it("opencode normalizes lowercase tool names", () => {
    expect(opencode.parse({ tool: "bash", args: { command: "ls" } }).tool).toBe("Bash");
  });
});

describe("adapter registry", () => {
  it("resolves an explicit list and ignores unknowns", () => {
    expect(resolveAdapters(["claude", "nope"], "project").map((a) => a.name)).toEqual(["claude"]);
  });

  it("looks adapters up by name", () => {
    expect(getAdapter("windsurf")?.label).toBe("Windsurf");
  });
});
