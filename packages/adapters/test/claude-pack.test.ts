import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claude } from "../src/claude.js";

let home: string;
let project: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "arx-home-"));
  project = fs.mkdtempSync(path.join(os.tmpdir(), "arx-proj-"));
  vi.spyOn(os, "homedir").mockReturnValue(home);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(project, { recursive: true, force: true });
});

function writers() {
  const w = claude.pack;
  if (
    !w?.mcp ||
    !w.removeMcp ||
    !w.skill ||
    !w.removeSkill ||
    !w.lifecycleHook ||
    !w.removeLifecycleHook
  )
    throw new Error("claude adapter must expose the full pack writer set");
  return {
    mcp: w.mcp,
    removeMcp: w.removeMcp,
    skill: w.skill,
    removeSkill: w.removeSkill,
    lifecycleHook: w.lifecycleHook,
    removeLifecycleHook: w.removeLifecycleHook,
  };
}

describe("claude pack writers", () => {
  it("wires an MCP server into ~/.claude.json under the project path (local scope)", () => {
    const { mcp, removeMcp } = writers();
    const server = {
      type: "http" as const,
      url: "http://localhost:8000/mcp",
      headers: { Authorization: "Bearer tok" },
    };
    const first = mcp("memcell", server, project);
    expect(first.changed).toBe(true);

    const config = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8"));
    expect(config.projects[project].mcpServers.memcell).toEqual({
      type: "http",
      url: "http://localhost:8000/mcp",
      headers: { Authorization: "Bearer tok" },
    });

    // idempotent: same server again is a no-op
    expect(mcp("memcell", server, project).changed).toBe(false);

    // removal deletes exactly that server
    expect(removeMcp("memcell", project).changed).toBe(true);
    const after = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8"));
    expect(after.projects[project].mcpServers.memcell).toBeUndefined();
  });

  it("preserves unrelated ~/.claude.json content", () => {
    const { mcp } = writers();
    fs.writeFileSync(
      path.join(home, ".claude.json"),
      JSON.stringify({ theme: "dark", projects: { "/other": { history: [1] } } }),
    );
    mcp("memcell", { type: "http", url: "http://x/mcp" }, project);
    const config = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8"));
    expect(config.theme).toBe("dark");
    expect(config.projects["/other"].history).toEqual([1]);
  });

  it("installs and removes a skill directory", () => {
    const { skill, removeSkill } = writers();
    const src = fs.mkdtempSync(path.join(os.tmpdir(), "arx-skill-"));
    fs.writeFileSync(path.join(src, "SKILL.md"), "---\nname: memcell-memory\n---\nrecall first.");
    skill("memcell-memory", src, project);
    const dest = path.join(project, ".claude", "skills", "memcell-memory", "SKILL.md");
    expect(fs.readFileSync(dest, "utf8")).toContain("recall first.");

    expect(removeSkill("memcell-memory", project).changed).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
    fs.rmSync(src, { recursive: true, force: true });
  });

  it("wires a SessionStart hook into settings.local.json, idempotently", () => {
    const { lifecycleHook, removeLifecycleHook } = writers();
    const script = path.join(project, ".reflex", "packs", "memcell", "hooks", "ctx.mjs");
    expect(lifecycleHook("SessionStart", script, 30, project).changed).toBe(true);
    expect(lifecycleHook("SessionStart", script, 30, project).changed).toBe(false);

    const file = path.join(project, ".claude", "settings.local.json");
    const settings = JSON.parse(fs.readFileSync(file, "utf8"));
    const entry = settings.hooks.SessionStart[0].hooks[0];
    expect(entry.command).toBe(`node ${JSON.stringify(script)}`);
    expect(entry.timeout).toBe(30);

    expect(removeLifecycleHook("SessionStart", script, project).changed).toBe(true);
    const after = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(after.hooks.SessionStart).toEqual([]);
  });
});
