import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  Adapter,
  Decision,
  HookResponse,
  PackWriteResult,
  ReflexContext,
  ResolvedMcpServer,
  Scope,
} from "@agentreflex/core";

const HOOK = "arx hook --agent claude";
const MATCHER = "Bash|Edit|MultiEdit|Write";

interface Settings {
  hooks?: {
    PreToolUse?: Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
interface Payload {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
}

const dir = (s: Scope) => path.join(s === "global" ? os.homedir() : process.cwd(), ".claude");
const settingsFile = (s: Scope) => path.join(dir(s), "settings.json");

function read(file: string): Settings {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Settings;
  } catch {
    return {};
  }
}
function write(file: string, settings: Settings): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
}

// ── pack writers ────────────────────────────────────────────────────────────
// Everything lands in USER-PRIVATE files, never committable ones:
//   mcp    → ~/.claude.json under this project's path ("local scope" — the same
//            place `claude mcp add --scope local` writes; pre-approved because
//            it's the user's own config, and the token never touches the repo)
//   skills → <project>/.claude/skills/<name>/ (auto-discovered, but content is
//            plain instructions — no secrets — so project placement is fine)
//   hooks  → <project>/.claude/settings.local.json (gitignored by Claude Code)

const claudeJsonFile = () => path.join(os.homedir(), ".claude.json");
const localSettingsFile = (projectDir: string) =>
  path.join(projectDir, ".claude", "settings.local.json");

interface ClaudeJson {
  projects?: Record<string, { mcpServers?: Record<string, unknown>; [k: string]: unknown }>;
  [k: string]: unknown;
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return {} as T;
  }
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

interface HookEntry {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
}

const claudePack = {
  mcp(name: string, server: ResolvedMcpServer, projectDir: string): PackWriteResult {
    const file = claudeJsonFile();
    const config = readJson<ClaudeJson>(file);
    config.projects ??= {};
    config.projects[projectDir] ??= {};
    const project = config.projects[projectDir] as { mcpServers?: Record<string, unknown> };
    project.mcpServers ??= {};
    const next = {
      type: server.type,
      url: server.url,
      ...(server.headers ? { headers: server.headers } : {}),
    };
    const changed = JSON.stringify(project.mcpServers[name]) !== JSON.stringify(next);
    if (changed) {
      project.mcpServers[name] = next;
      fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    }
    return { file, changed };
  },

  removeMcp(name: string, projectDir: string): PackWriteResult {
    const file = claudeJsonFile();
    const config = readJson<ClaudeJson>(file);
    const servers = config.projects?.[projectDir]?.mcpServers as
      | Record<string, unknown>
      | undefined;
    const changed = servers ? name in servers : false;
    if (changed && servers) {
      delete servers[name];
      fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    }
    return { file, changed };
  },

  skill(name: string, sourceDir: string, projectDir: string): PackWriteResult {
    const dest = path.join(projectDir, ".claude", "skills", name);
    copyDir(sourceDir, dest);
    return { file: dest, changed: true };
  },

  removeSkill(name: string, projectDir: string): PackWriteResult {
    const dest = path.join(projectDir, ".claude", "skills", name);
    const existed = fs.existsSync(dest);
    if (existed) fs.rmSync(dest, { recursive: true, force: true });
    return { file: dest, changed: existed };
  },

  lifecycleHook(
    event: "SessionStart" | "UserPromptSubmit" | "Stop" | "SessionEnd",
    script: string,
    timeout: number | undefined,
    projectDir: string,
  ): PackWriteResult {
    const file = localSettingsFile(projectDir);
    const settings = readJson<Settings>(file);
    settings.hooks ??= {};
    const hooks = settings.hooks as Record<string, unknown>;
    hooks[event] ??= [];
    const entries = hooks[event] as HookEntry[];
    const command = `node ${JSON.stringify(script)}`;
    const already = entries.some((e) => e.hooks?.some((h) => h.command === command));
    if (!already) {
      entries.push({ hooks: [{ type: "command", command, ...(timeout ? { timeout } : {}) }] });
      write(file, settings);
    }
    return { file, changed: !already };
  },

  removeLifecycleHook(
    event: "SessionStart" | "UserPromptSubmit" | "Stop" | "SessionEnd",
    script: string,
    projectDir: string,
  ): PackWriteResult {
    const file = localSettingsFile(projectDir);
    if (!fs.existsSync(file)) return { file, changed: false };
    const settings = readJson<Settings>(file);
    const entries = (settings.hooks as Record<string, unknown> | undefined)?.[event] as
      | HookEntry[]
      | undefined;
    if (!entries) return { file, changed: false };
    const command = `node ${JSON.stringify(script)}`;
    let changed = false;
    for (const e of entries) {
      const before = e.hooks?.length ?? 0;
      if (e.hooks) e.hooks = e.hooks.filter((h) => h.command !== command);
      if ((e.hooks?.length ?? 0) !== before) changed = true;
    }
    if (settings.hooks)
      (settings.hooks as Record<string, unknown>)[event] = entries.filter(
        (e) => (e.hooks?.length ?? 0) > 0,
      );
    if (changed) write(file, settings);
    return { file, changed };
  },
};

export const claude: Adapter = {
  name: "claude",
  label: "Claude Code",
  enforces: true,
  capabilities: { events: ["onToolCall"], decisions: ["pass", "deny", "ask"] },

  parse(payload): ReflexContext {
    const p = (payload ?? {}) as Payload;
    const input = p.tool_input ?? {};
    const paths: string[] = [];
    if (typeof input.file_path === "string") paths.push(input.file_path);
    return {
      event: "onToolCall",
      agent: "claude",
      tool: p.tool_name ?? "",
      command: typeof input.command === "string" ? input.command : undefined,
      paths,
      cwd: p.cwd ?? process.cwd(),
      raw: payload,
    };
  },

  format(decision: Decision): HookResponse {
    if (decision.action !== "deny" && decision.action !== "ask") return {};
    return {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: decision.action,
          permissionDecisionReason: decision.reason,
        },
      }),
    };
  },

  install(scope) {
    const file = settingsFile(scope);
    const settings = read(file);
    settings.hooks ??= {};
    settings.hooks.PreToolUse ??= [];
    const pre = settings.hooks.PreToolUse;
    const already = pre.some((m) => m.hooks?.some((h) => h.command === HOOK));
    if (!already) {
      pre.push({ matcher: MATCHER, hooks: [{ type: "command", command: HOOK }] });
      write(file, settings);
    }
    return { file, changed: !already };
  },

  uninstall(scope) {
    const file = settingsFile(scope);
    if (!fs.existsSync(file)) return { file, changed: false };
    const settings = read(file);
    const pre = settings.hooks?.PreToolUse;
    if (!pre) return { file, changed: false };
    let changed = false;
    for (const m of pre) {
      const before = m.hooks?.length ?? 0;
      if (m.hooks) m.hooks = m.hooks.filter((h) => !h.command.includes("hook --agent"));
      if ((m.hooks?.length ?? 0) !== before) changed = true;
    }
    if (settings.hooks) settings.hooks.PreToolUse = pre.filter((m) => (m.hooks?.length ?? 0) > 0);
    if (changed) write(file, settings);
    return { file, changed };
  },

  isInstalled(scope) {
    return fs.existsSync(dir(scope));
  },

  pack: claudePack,
};
