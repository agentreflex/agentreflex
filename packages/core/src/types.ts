/** A normalized tool name in PascalCase: "Bash" | "Edit" | "Write" | "Read" | … */
export type ToolName = string;

/** A coding agent agentreflex can speak to. */
export type AgentName =
  | "claude"
  | "copilot"
  | "cursor"
  | "gemini"
  | "windsurf"
  | "opencode"
  | "codex";

/** Where a reflex or hook is installed. */
export type Scope = "project" | "global";

/** A normalized tool call, before the agent runs it. */
export interface ToolCallContext {
  event: "onToolCall";
  agent: AgentName;
  tool: ToolName;
  /** The shell command, when the tool is a shell. */
  command?: string;
  /** File paths the tool would touch, absolute where the agent provides them. */
  paths: string[];
  cwd: string;
  /** The original agent payload, untouched. */
  raw: unknown;
  /** Options this reflex was configured with in `.reflex/config.json` (`with`). */
  options?: Record<string, unknown>;
}

/** A normalized tool result, after the agent runs it. */
export interface ToolResultContext {
  event: "onToolResult";
  agent: AgentName;
  tool: ToolName;
  command?: string;
  paths: string[];
  cwd: string;
  raw: unknown;
  /** The tool's output text, where the adapter can extract it. */
  output?: string;
  /** Whether the tool reported success — undefined when the agent doesn't say. */
  success?: boolean;
  /** Options this reflex was configured with in `.reflex/config.json` (`with`). */
  options?: Record<string, unknown>;
}

export type ReflexContext = ToolCallContext | ToolResultContext;

/** What a reflex decides for a tool call. */
export type Decision =
  | { action: "pass" }
  | { action: "deny"; reason: string }
  | { action: "ask"; reason: string }
  | { action: "modify"; args: Record<string, unknown>; reason?: string };

export type DecisionAction = Decision["action"];

export const pass = (): Decision => ({ action: "pass" });
export const deny = (reason: string): Decision => ({ action: "deny", reason });
export const ask = (reason: string): Decision => ({ action: "ask", reason });
export const modify = (args: Record<string, unknown>, reason?: string): Decision => ({
  action: "modify",
  args,
  reason,
});

/** How a reflex reacts to a tool result. `inject` feeds context back into the
 *  agent's conversation; `block` tells the agent the result must not stand. */
export type Reaction =
  | { action: "none" }
  | { action: "inject"; context: string }
  | { action: "block"; reason: string };

export type ReactionAction = Reaction["action"];

export const none = (): Reaction => ({ action: "none" });
export const inject = (context: string): Reaction => ({ action: "inject", context });
export const block = (reason: string): Reaction => ({ action: "block", reason });

/** A reflex: a named bundle of lifecycle handlers — the unit you install and share. */
export interface Reflex {
  name: string;
  onToolCall?(ctx: ToolCallContext): Decision | Promise<Decision>;
  /** Returning nothing (or `none()`) keeps the old observer behaviour. */
  // biome-ignore lint/suspicious/noConfusingVoidType: void keeps plain observer handlers (no return statement) assignable
  onToolResult?(ctx: ToolResultContext): Reaction | void | Promise<Reaction | void>;
}

/** Identity helper for authoring (types + autocomplete, no runtime cost). */
export function defineReflex(reflex: Reflex): Reflex {
  return reflex;
}

/** What an agent can faithfully honor — drives graceful degradation. */
export interface Capabilities {
  events: Array<ReflexContext["event"]>;
  decisions: DecisionAction[];
  /** Reactions the agent can carry back after a tool result — absent = none. */
  reactions?: ReactionAction[];
}

/** What the dispatcher emits back to the agent: stdout payload, stderr, and/or exit code. */
export interface HookResponse {
  stdout?: string;
  stderr?: string;
  exit?: number;
}

/** One file-touching outcome of a pack write. */
export interface PackWriteResult {
  file: string;
  changed: boolean;
}

/** An interpolated MCP server — literal values, ready to write. */
export interface ResolvedMcpServer {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

/** How an agent receives pack capabilities. Every method is optional — an
 *  absent method means "this agent can't carry that capability" and install
 *  degrades gracefully (reported, never fatal), same philosophy as
 *  `enforces`. All writes are project-scoped and land in USER-PRIVATE files
 *  (never committable ones): secrets must not end up in a repo. */
export interface PackWriter {
  /** Wire a remote MCP server for this project. */
  mcp?(name: string, server: ResolvedMcpServer, projectDir: string): PackWriteResult;
  removeMcp?(name: string, projectDir: string): PackWriteResult;
  /** Install a skill (a directory containing SKILL.md) for this project. */
  skill?(name: string, sourceDir: string, projectDir: string): PackWriteResult;
  removeSkill?(name: string, projectDir: string): PackWriteResult;
  /** Wire a session-lifecycle hook script (absolute path, run with node). */
  lifecycleHook?(
    event: "SessionStart" | "UserPromptSubmit" | "Stop" | "SessionEnd",
    script: string,
    timeout: number | undefined,
    projectDir: string,
  ): PackWriteResult;
  removeLifecycleHook?(
    event: "SessionStart" | "UserPromptSubmit" | "Stop" | "SessionEnd",
    script: string,
    projectDir: string,
  ): PackWriteResult;
}

/** Maps one agent's native hook dialect to and from the canonical model. */
export interface Adapter {
  name: AgentName;
  label: string;
  /** true if it can block/ask; false = advisory only. */
  enforces: boolean;
  capabilities: Capabilities;
  parse(payload: unknown): ReflexContext;
  /** Serialize a decision to the agent's native response (stdout/stderr/exit). */
  format(decision: Decision): HookResponse;
  /** Serialize a reaction to the agent's native post-tool response. Absent =
   *  the agent can't carry reactions and they degrade to no-ops. The context
   *  lets dialects that distinguish success/failure events respond in kind. */
  formatResult?(reaction: Reaction, ctx?: ToolResultContext): HookResponse;
  install(scope: Scope): { file: string; changed: boolean };
  uninstall(scope: Scope): { file: string; changed: boolean };
  isInstalled(scope: Scope): boolean;
  /** Pack-capability writers (MCP / skills / lifecycle hooks). */
  pack?: PackWriter;
}
