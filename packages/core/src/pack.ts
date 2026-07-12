/**
 * Packs — the composite distributable unit.
 *
 * A reflex is one guardrail. A **pack** is everything a real capability needs
 * to land in an agent: MCP servers (tools), skills (instructions), lifecycle
 * hooks (triggers), reflexes (guardrails), and the secrets/options they're
 * configured with. `reflex.json` stays the manifest for a single reflex; a
 * `pack.json` bundles capabilities and is what `arx add` installs when it
 * finds one. agentreflex stays neutral: packs live in THEIR product's repo
 * and are fetched by path/URL/registry — none are privileged.
 */

/** A secret a pack needs (e.g. an API token). Prompted for at install time,
 *  stored in the user-private secret store (never in the project), injected
 *  into capability configs via `${secrets.<name>}`. */
export interface PackSecretDecl {
  /** Shown when prompting. */
  title: string;
  /** Where a human gets one (a URL or short instruction). */
  description?: string;
  required?: boolean;
}

/** A non-secret setting with a default, overridable at install time and
 *  referenced via `${options.<name>}`. */
export interface PackOptionDecl {
  title: string;
  description?: string;
  default?: string;
}

/** A remote MCP server the pack wires into each agent. v1 is HTTP-transport
 *  only — the shape remote products actually ship. */
export interface PackMcpServer {
  type: "http";
  /** May reference `${options.*}` / `${secrets.*}`. */
  url: string;
  /** Header values may reference `${options.*}` / `${secrets.*}`. */
  headers?: Record<string, string>;
}

/** A skill: a directory (or single SKILL.md) of instructions the agent
 *  auto-discovers. `source` is relative to the pack root. */
export interface PackSkill {
  name: string;
  source: string;
}

/** The session-lifecycle moments a pack can hook. `SessionStart` runs once as
 *  a session opens (context seeding); `UserPromptSubmit` runs on every prompt
 *  before the model sees it (deterministic per-prompt work, e.g. recall);
 *  `Stop` runs each time the agent finishes a response (deterministic
 *  post-turn work, e.g. capture); `SessionEnd` runs once as the session
 *  closes (flush/finalize work, e.g. consolidation). */
export type PackHookEvent = "SessionStart" | "UserPromptSubmit" | "Stop" | "SessionEnd";

/** A lifecycle hook: a script the agent runs at a lifecycle moment.
 *  `run` is a JS file relative to the pack root, executed with node. */
export interface PackLifecycleHook {
  event: PackHookEvent;
  run: string;
  /** Seconds before the agent gives up on the hook. */
  timeout?: number;
}

/** A reflex shipped inside a pack. `source` is relative to the pack root. */
export interface PackReflex {
  source: string;
  with?: Record<string, unknown>;
}

/** The pack manifest — `pack.json` at the pack root. */
export interface PackManifest {
  $schema?: string;
  name: string;
  title?: string;
  description?: string;
  version?: string;
  license?: string;
  homepage?: string;
  /** Registry category (e.g. "memory", "safety"). */
  category?: string;
  secrets?: Record<string, PackSecretDecl>;
  options?: Record<string, PackOptionDecl>;
  mcp?: Record<string, PackMcpServer>;
  skills?: PackSkill[];
  hooks?: PackLifecycleHook[];
  reflexes?: PackReflex[];
  /** Restrict to specific agents; absent = every agent that supports the
   *  capability (graceful degradation, same philosophy as `enforces`). */
  agents?: string[];
}

/** Values gathered at install time, keyed by declaration name. */
export interface PackValues {
  secrets: Record<string, string>;
  options: Record<string, string>;
}

const REF = /\$\{(secrets|options)\.([A-Za-z0-9_-]+)\}/g;

/** Interpolate `${secrets.x}` / `${options.x}` references in a string.
 *  Unknown references throw — a half-configured secret must fail loudly at
 *  install time, never silently produce a config with a literal `${...}`. */
export function interpolate(template: string, values: PackValues): string {
  return template.replace(REF, (_, kind: "secrets" | "options", name: string) => {
    const v = values[kind][name];
    if (v === undefined)
      throw new Error(`pack references \${${kind}.${name}} but no value was provided`);
    return v;
  });
}

/** All `${secrets.*}` names a manifest's mcp block references — what install
 *  must actually prompt for (declared-but-unused secrets are skipped). */
export function referencedSecrets(manifest: PackManifest): string[] {
  const out = new Set<string>();
  const scan = (s: string) => {
    for (const m of s.matchAll(REF)) if (m[1] === "secrets") out.add(m[2] as string);
  };
  for (const server of Object.values(manifest.mcp ?? {})) {
    scan(server.url);
    for (const v of Object.values(server.headers ?? {})) scan(v);
  }
  return [...out];
}

/** Parse + validate a pack.json's load-bearing shape. Throws with a specific
 *  message on anything malformed — packs come from the network. */
export function parsePackManifest(json: string): PackManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("pack.json is not valid JSON");
  }
  const m = raw as PackManifest;
  if (!m || typeof m !== "object") throw new Error("pack.json must be an object");
  if (!m.name || typeof m.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(m.name))
    throw new Error("pack.json needs a kebab-case `name`");
  for (const [key, server] of Object.entries(m.mcp ?? {})) {
    if (server.type !== "http")
      throw new Error(`mcp server '${key}': only type "http" is supported`);
    if (!server.url || typeof server.url !== "string")
      throw new Error(`mcp server '${key}' needs a url`);
  }
  for (const s of m.skills ?? []) {
    if (!s.name || !s.source) throw new Error("every skill needs a name and a source");
    if (s.source.includes(".."))
      throw new Error(`skill '${s.name}': source must stay inside the pack`);
  }
  for (const h of m.hooks ?? []) {
    if (
      h.event !== "SessionStart" &&
      h.event !== "UserPromptSubmit" &&
      h.event !== "Stop" &&
      h.event !== "SessionEnd"
    )
      throw new Error(
        `hook event '${String(h.event)}' is not supported (SessionStart | UserPromptSubmit | Stop | SessionEnd)`,
      );
    if (!h.run || h.run.includes("..")) throw new Error("every hook needs a `run` inside the pack");
  }
  for (const r of m.reflexes ?? []) {
    if (!r.source || r.source.includes(".."))
      throw new Error("every reflex needs a `source` inside the pack");
  }
  return m;
}
