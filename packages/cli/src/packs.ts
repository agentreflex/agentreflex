import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ADAPTERS } from "@agentreflex/adapters";
import type { Adapter, PackManifest, PackValues } from "@agentreflex/core";
import { interpolate, parsePackManifest, referencedSecrets } from "@agentreflex/core";
import { type Config, readConfig, reflexDir, writeConfig } from "./load.js";
import { dim, head, lime, white } from "./ui.js";

/** Where a project's installed packs live: `.reflex/packs/<name>/`. */
export const packsDir = (cwd: string) => path.join(reflexDir(cwd), "packs");
export const packDir = (cwd: string, name: string) => path.join(packsDir(cwd), name);

/** An installed pack, as recorded in `.reflex/config.json`. */
export interface PackEntry {
  name: string;
  source: string;
  version?: string;
  /** Which agents it was applied to (for removal + doctor). */
  agents: string[];
  /** The option values this install resolved (defaults + --set overrides).
   *  Doctor and reinstall read THESE, so they always see the same endpoint
   *  the agents were wired with — never a silently different default. */
  options?: Record<string, string>;
}

export interface ConfigWithPacks extends Config {
  packs?: PackEntry[];
}

// ── secret store: user-private, never in the project ───────────────────────

const secretsFile = () => path.join(os.homedir(), ".agentreflex", "secrets.json");

type SecretStore = Record<string, Record<string, string>>;

export function readSecrets(): SecretStore {
  try {
    return JSON.parse(fs.readFileSync(secretsFile(), "utf8")) as SecretStore;
  } catch {
    return {};
  }
}

export function writeSecret(pack: string, name: string, value: string): void {
  const file = secretsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const store = readSecrets();
  store[pack] ??= {};
  store[pack][name] = value;
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600); // writeFileSync mode is ignored if the file existed
}

export function deleteSecrets(pack: string): void {
  const store = readSecrets();
  if (!(pack in store)) return;
  delete store[pack];
  fs.writeFileSync(secretsFile(), `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

// ── fetching a pack to a local staging dir ──────────────────────────────────

/** Every file a manifest references, relative to the pack root. */
function referencedFiles(manifest: PackManifest): string[] {
  const files: string[] = [];
  for (const s of manifest.skills ?? []) files.push(s.source);
  for (const h of manifest.hooks ?? []) files.push(h.run);
  for (const r of manifest.reflexes ?? []) files.push(r.source);
  return files;
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

/** Materialize the pack (manifest + referenced files) into `.reflex/packs/<name>`.
 *  Local dirs are copied wholesale; remote packs fetch the manifest plus each
 *  referenced file (a skill `source` that is a directory fetches `SKILL.md`). */
export async function stagePack(
  spec: string,
  cwd: string,
): Promise<{ manifest: PackManifest; dir: string }> {
  // local directory (the dogfood path): pack.json inside a folder on disk
  const localDir = spec.startsWith(".") || spec.startsWith("/") ? path.resolve(cwd, spec) : null;
  if (localDir && fs.existsSync(path.join(localDir, "pack.json"))) {
    const manifest = parsePackManifest(fs.readFileSync(path.join(localDir, "pack.json"), "utf8"));
    const dest = packDir(cwd, manifest.name);
    fs.rmSync(dest, { recursive: true, force: true });
    copyDir(localDir, dest);
    return { manifest, dir: dest };
  }

  // remote: a URL (or github: shorthand) pointing at pack.json or its folder
  let base = spec.startsWith("github:") ? githubRaw(spec) : spec;
  if (!/^https?:\/\//.test(base)) throw new Error(`'${spec}' is not a pack directory or URL`);
  if (!base.endsWith("pack.json")) base = `${base.replace(/\/$/, "")}/pack.json`;
  const manifest = parsePackManifest(await fetchText(base));
  const dest = packDir(cwd, manifest.name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "pack.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const rel of referencedFiles(manifest)) {
    const isSkillDir =
      (manifest.skills ?? []).some((s) => s.source === rel) && !rel.endsWith(".md");
    const relFile = isSkillDir ? `${rel.replace(/\/$/, "")}/SKILL.md` : rel;
    const body = await fetchText(new URL(relFile, base).href);
    const out = path.join(dest, relFile);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, body);
  }
  return { manifest, dir: dest };
}

function githubRaw(spec: string): string {
  const [owner, repo, ...rest] = spec.slice("github:".length).split("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${rest.join("/")}`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ── install: values → interpolate → apply per agent ────────────────────────

/** Gather secret/option values: stored secrets are reused; missing REFERENCED
 *  secrets are prompted for (TTY) or fail with a clear message (non-TTY). */
export async function gatherValues(
  manifest: PackManifest,
  optionOverrides: Record<string, string> = {},
): Promise<PackValues> {
  const values: PackValues = { secrets: {}, options: {} };
  for (const [name, decl] of Object.entries(manifest.options ?? {}))
    values.options[name] = optionOverrides[name] ?? decl.default ?? "";

  const needed = referencedSecrets(manifest);
  const stored = readSecrets()[manifest.name] ?? {};
  const missing: string[] = [];
  for (const name of needed) {
    if (stored[name]) values.secrets[name] = stored[name];
    else missing.push(name);
  }
  if (missing.length === 0) return values;

  if (!process.stdout.isTTY) {
    throw new Error(
      `missing secret${missing.length > 1 ? "s" : ""} ${missing.join(", ")} — run interactively to be prompted`,
    );
  }
  const p = await import("@clack/prompts");
  for (const name of missing) {
    const decl = manifest.secrets?.[name];
    const value = await p.password({
      message: `${decl?.title ?? name}${decl?.description ? ` — ${decl.description}` : ""}`,
      validate: (v) => (v.trim() ? undefined : "required"),
    });
    if (p.isCancel(value)) throw new Error("cancelled");
    writeSecret(manifest.name, name, String(value).trim());
    values.secrets[name] = String(value).trim();
  }
  return values;
}

export interface ApplyResult {
  agent: string;
  applied: string[]; // capability labels that landed
  skipped: string[]; // capability labels the agent can't carry
}

/** Apply a staged pack to every targeted agent that supports each capability.
 *  Degrades per capability, never fatal — the report says what landed where. */
export function applyPack(
  manifest: PackManifest,
  stagedDir: string,
  cwd: string,
  values: PackValues,
): ApplyResult[] {
  const targets = ADAPTERS.filter(
    (a) => (!manifest.agents || manifest.agents.includes(a.name)) && a.pack,
  );
  const results: ApplyResult[] = [];
  for (const adapter of targets) {
    const w = adapter.pack as NonNullable<Adapter["pack"]>;
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const [name, server] of Object.entries(manifest.mcp ?? {})) {
      if (!w.mcp) {
        skipped.push(`mcp:${name}`);
        continue;
      }
      const resolved = {
        type: server.type,
        url: interpolate(server.url, values),
        headers: server.headers
          ? Object.fromEntries(
              Object.entries(server.headers).map(([k, v]) => [k, interpolate(v, values)]),
            )
          : undefined,
      };
      w.mcp(name, resolved, cwd);
      applied.push(`mcp:${name}`);
    }

    for (const skill of manifest.skills ?? []) {
      if (!w.skill) {
        skipped.push(`skill:${skill.name}`);
        continue;
      }
      let src = path.join(stagedDir, skill.source);
      if (src.endsWith(".md")) src = path.dirname(src);
      w.skill(skill.name, src, cwd);
      applied.push(`skill:${skill.name}`);
    }

    for (const hook of manifest.hooks ?? []) {
      if (!w.lifecycleHook) {
        skipped.push(`hook:${hook.event}`);
        continue;
      }
      w.lifecycleHook(hook.event, path.join(stagedDir, hook.run), hook.timeout, cwd);
      applied.push(`hook:${hook.event}`);
    }

    results.push({ agent: adapter.name, applied, skipped });
  }
  return results;
}

/** Record the installed pack (and its reflexes) in `.reflex/config.json`. */
export function registerPack(
  cwd: string,
  manifest: PackManifest,
  source: string,
  agents: string[],
  options: Record<string, string> = {},
): void {
  const config = readConfig(cwd) as ConfigWithPacks;
  config.packs = (config.packs ?? []).filter((p) => p.name !== manifest.name);
  config.packs.push({ name: manifest.name, source, version: manifest.version, agents, options });
  config.reflexes ??= [];
  for (const r of manifest.reflexes ?? []) {
    const source = `./packs/${manifest.name}/${r.source}`;
    if (!config.reflexes.some((e) => (typeof e === "string" ? e : e.source) === source))
      config.reflexes.push(r.with ? { source, with: r.with } : source);
  }
  writeConfig(cwd, config);
}

/** Undo everything `applyPack` + `registerPack` did for one pack. */
export function removePack(cwd: string, name: string): { removed: boolean; notes: string[] } {
  const config = readConfig(cwd) as ConfigWithPacks;
  const entry = (config.packs ?? []).find((p) => p.name === name);
  const staged = packDir(cwd, name);
  const manifestFile = path.join(staged, "pack.json");
  const notes: string[] = [];

  if (fs.existsSync(manifestFile)) {
    const manifest = parsePackManifest(fs.readFileSync(manifestFile, "utf8"));
    const agents = entry?.agents ?? ADAPTERS.filter((a) => a.pack).map((a) => a.name);
    for (const adapter of ADAPTERS.filter((a) => agents.includes(a.name) && a.pack)) {
      const w = adapter.pack as NonNullable<Adapter["pack"]>;
      for (const serverName of Object.keys(manifest.mcp ?? {})) w.removeMcp?.(serverName, cwd);
      for (const skill of manifest.skills ?? []) w.removeSkill?.(skill.name, cwd);
      for (const hook of manifest.hooks ?? [])
        w.removeLifecycleHook?.(hook.event, path.join(staged, hook.run), cwd);
      notes.push(adapter.name);
    }
  }

  const prefix = `./packs/${name}/`;
  config.reflexes = (config.reflexes ?? []).filter(
    (e) => !(typeof e === "string" ? e : e.source).startsWith(prefix),
  );
  config.packs = (config.packs ?? []).filter((p) => p.name !== name);
  writeConfig(cwd, config);
  fs.rmSync(staged, { recursive: true, force: true });
  deleteSecrets(name);
  return { removed: Boolean(entry) || notes.length > 0, notes };
}

// ── doctor: probe each installed pack's MCP servers, with honest verdicts ──

export interface McpProbe {
  pack: string;
  server: string;
  url: string;
  verdict: "ok" | "unauthorized" | "host-rejected" | "not-found" | "unreachable" | `http-${number}`;
  detail: string;
}

export async function probePacks(cwd: string): Promise<McpProbe[]> {
  const config = readConfig(cwd) as ConfigWithPacks;
  const out: McpProbe[] = [];
  for (const entry of config.packs ?? []) {
    const manifestFile = path.join(packDir(cwd, entry.name), "pack.json");
    if (!fs.existsSync(manifestFile)) continue;
    const manifest = parsePackManifest(fs.readFileSync(manifestFile, "utf8"));
    let values: PackValues;
    try {
      values = await gatherValuesNonInteractive(manifest, entry.options ?? {});
    } catch {
      for (const server of Object.keys(manifest.mcp ?? {}))
        out.push({
          pack: entry.name,
          server,
          url: "",
          verdict: "unauthorized",
          detail: "no stored secret — re-run arx add",
        });
      continue;
    }
    for (const [name, server] of Object.entries(manifest.mcp ?? {})) {
      const url = interpolate(server.url, values);
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      for (const [k, v] of Object.entries(server.headers ?? {}))
        headers[k] = interpolate(v, values);
      out.push(await probeMcp(entry.name, name, url, headers));
    }
  }
  return out;
}

async function gatherValuesNonInteractive(
  manifest: PackManifest,
  optionOverrides: Record<string, string> = {},
): Promise<PackValues> {
  const values: PackValues = { secrets: {}, options: {} };
  for (const [name, decl] of Object.entries(manifest.options ?? {}))
    values.options[name] = optionOverrides[name] ?? decl.default ?? "";
  const stored = readSecrets()[manifest.name] ?? {};
  for (const name of referencedSecrets(manifest)) {
    if (!stored[name]) throw new Error(`missing secret ${name}`);
    values.secrets[name] = stored[name];
  }
  return values;
}

/** One JSON-RPC initialize against the server — the same handshake the agent
 *  performs, so the verdict is the agent's reality, not a synthetic ping. */
async function probeMcp(
  pack: string,
  server: string,
  url: string,
  headers: Record<string, string>,
): Promise<McpProbe> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "arx-doctor", version: "1" },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok)
      return { pack, server, url, verdict: "ok", detail: "initialize handshake accepted" };
    if (res.status === 401)
      return {
        pack,
        server,
        url,
        verdict: "unauthorized",
        detail: "token rejected (401) — re-run arx add to update it",
      };
    if (res.status === 421)
      return {
        pack,
        server,
        url,
        verdict: "host-rejected",
        detail:
          "server rejected the Host header (421) — its allowed-hosts list is missing this hostname:port",
      };
    if (res.status === 404)
      return {
        pack,
        server,
        url,
        verdict: "not-found",
        detail: "no MCP endpoint at this path (404) — check the URL",
      };
    return {
      pack,
      server,
      url,
      verdict: `http-${res.status}`,
      detail: `unexpected HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      pack,
      server,
      url,
      verdict: "unreachable",
      detail: `no response — is the server up? (${(err as Error).message})`,
    };
  }
}

// ── shared pretty-printer for add/remove/doctor pack sections ───────────────

export function printApply(manifest: PackManifest, results: ApplyResult[]): void {
  console.log(head(`pack · ${manifest.name}${manifest.version ? ` v${manifest.version}` : ""}`));
  for (const r of results) {
    if (r.applied.length === 0 && r.skipped.length === 0) continue;
    const ok = r.applied.length ? lime(r.applied.join(" ")) : "";
    const skip = r.skipped.length ? dim(` (can't carry: ${r.skipped.join(" ")})`) : "";
    console.log(`  ${lime("●")} ${white(r.agent)}  ${ok}${skip}`);
  }
}
