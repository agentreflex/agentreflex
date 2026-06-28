#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ADAPTERS, getAdapter, resolveAdapters } from "@agentreflex/adapters";
import { runToolCall, runToolResult } from "@agentreflex/core";
import type { AgentName, Reflex, Scope } from "@agentreflex/core";
import * as p from "@clack/prompts";
import {
  type Config,
  configPath,
  loadReflexes,
  readConfig,
  reflexDir,
  writeConfig,
} from "./load.js";
import { amber, banner, bar, bold, cyan, dim, head, lime, mark, pad, pill, white } from "./ui.js";

const VERSION = "0.2.0"; // x-release-please-version
const REGISTRY_URL = "https://agentreflex.dev/registry/registry.json";

type Opts = Record<string, string | boolean>;
const VALUE_FLAGS = new Set([
  "--agent",
  "--scope",
  "--dir",
  "--registry",
  "--tool",
  "--paths",
  "--event",
  "--reflex",
  "--file",
]);

function parseArgs(rest: string[]): { opts: Opts; pos: string[] } {
  const opts: Opts = {};
  const pos: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (VALUE_FLAGS.has(a)) {
      opts[a.slice(2)] = rest[i + 1] ?? "";
      i += 1;
    } else if (a.startsWith("--")) {
      opts[a.slice(2)] = true;
    } else {
      pos.push(a);
    }
  }
  return { opts, pos };
}

const scopeOf = (opts: Opts): Scope =>
  opts.scope === "global" || opts.global ? "global" : "project";
const agentsOf = (opts: Opts): string[] =>
  typeof opts.agent === "string" ? opts.agent.split(",").map((s) => s.trim()) : [];

function reflexTemplate(name: string): string {
  return `export default {
  name: ${JSON.stringify(name)},
  onToolCall(ctx) {
    // ctx: { tool, command, paths, cwd, agent }
    // return { action: "deny" | "ask", reason } to stop the agent, or pass through.
    if (ctx.tool === "Bash" && /rm\\s+-rf/.test(ctx.command ?? ""))
      return { action: "ask", reason: "double-checking that rm -rf" };
    return { action: "pass" };
  },
};
`;
}

function addToConfig(cwd: string, source: string): boolean {
  const config: Config = readConfig(cwd);
  config.reflexes ??= [];
  const has = config.reflexes.some((e) => (typeof e === "string" ? e : e.source) === source);
  if (!has) config.reflexes.push(source);
  writeConfig(cwd, config);
  return !has;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// ── hook: the dispatcher each agent calls (machine-facing, silent, fail-open) ──
async function cmdHook(agent: string): Promise<void> {
  // A human ran this in a terminal. Real agent invocations capture stdout (not a
  // TTY) and feed a payload on stdin; by hand it just looks like nothing happens —
  // pass is silent and a deny prints raw JSON meant for the agent. Point them at
  // the tool actually meant for testing, and leave the machine path untouched.
  if (process.stdout.isTTY) {
    console.log(head("hook"));
    console.log(`  ${dim("this is the dispatcher your agents call — not a manual test tool.")}`);
    console.log(`  ${dim("to test a reflex yourself, use")} ${lime("arx dev")}${dim(":")}`);
    console.log(
      `  ${lime('arx dev "git push --force"')}   ${dim("·")}   ${lime("arx dev --tool Read --paths .env")}\n`,
    );
    return;
  }
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;
    const adapter = getAdapter(agent);
    if (!adapter) return;
    const ctx = adapter.parse(JSON.parse(raw));
    const reflexes = await loadReflexes(ctx.cwd);
    if (reflexes.length === 0) return;
    if (ctx.event === "onToolCall") {
      const res = adapter.format(await runToolCall(reflexes, ctx));
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      if (res.exit && res.exit !== 0) process.exit(res.exit);
    } else {
      await runToolResult(reflexes, ctx);
    }
  } catch {
    // fail open: agentreflex never blocks or crashes the agent on its own error
  }
}

// ── install / uninstall ──
function cmdInstall(opts: Opts): void {
  const scope = scopeOf(opts);
  const adapters = resolveAdapters(agentsOf(opts), scope).filter((a) => a.enforces);
  console.log(head(`install · ${scope}`));
  if (adapters.length === 0) {
    console.log(`  ${dim("no agents detected — try")} ${lime("arx install --agent claude")}\n`);
    return;
  }
  for (const a of adapters) {
    const r = a.install(scope);
    console.log(
      r.changed
        ? `  ${lime("●")} ${white(a.label)}`
        : `  ${dim("○")} ${dim(`${a.label} · already wired`)}`,
    );
  }
  console.log(`\n  ${mark} ${dim("deny/ask reflexes now fire in the agents above.")}\n`);
}

function cmdUninstall(opts: Opts): void {
  const scope = scopeOf(opts);
  const requested = agentsOf(opts);
  const adapters =
    requested.length === 0
      ? ADAPTERS
      : requested.map(getAdapter).filter((a): a is (typeof ADAPTERS)[number] => a !== undefined);
  console.log(head(`uninstall · ${scope}`));
  for (const a of adapters) {
    const r = a.uninstall(scope);
    console.log(
      r.changed
        ? `  ${lime("●")} ${white(`removed from ${a.label}`)}`
        : `  ${dim("○")} ${dim(`${a.label} · nothing to remove`)}`,
    );
  }
  console.log("");
}

// ── doctor: status at a glance, in the framed 3-row panel ──
async function cmdDoctor(cwd: string): Promise<void> {
  const enforceable = ADAPTERS.filter((a) => a.enforces);
  const live = enforceable.filter((a) => a.isInstalled("project") || a.isInstalled("global"));
  const count = (await loadReflexes(cwd)).length;
  const home = os.homedir();
  const where = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  const agents = enforceable.map((a) => (live.includes(a) ? lime(a.name) : dim(a.name))).join(" ");
  const askers = enforceable
    .filter((a) => a.capabilities.decisions.includes("ask"))
    .map((a) => a.name)
    .join("/");

  console.log("");
  console.log(
    `  ${pill("agentreflex")}  ${dim(where)}   ${mark} ${white(String(count))} ${dim("reflexes active")}`,
  );
  console.log(
    `  ${dim("agents")}  ${bar(live.length, enforceable.length)}  ${white(`${live.length}/${enforceable.length}`)} ${dim("enforcing")}   ${agents} ${dim("· codex advisory")}`,
  );
  console.log(
    `  ${lime("✦")} ${dim("deny")} ${lime("✓")} ${dim("everywhere")}    ${dim("ask")} ${lime("✓")} ${dim(askers)} ${amber("~")}${dim("gemini")}`,
  );
  console.log("");
}

// ── init: the interactive flow ──
async function cmdInit(cwd: string): Promise<void> {
  console.log(banner(VERSION));
  p.intro(lime("let's give your agents reflexes"));

  const spin = p.spinner();
  spin.start("scanning for agents");
  const detected = ADAPTERS.filter((a) => a.enforces && a.isInstalled("project"));
  spin.stop(
    detected.length ? `found ${detected.map((a) => a.label).join(", ")}` : "no agents detected yet",
  );

  const chosen = await p.multiselect({
    message: "which agents should enforce your reflexes?",
    options: ADAPTERS.filter((a) => a.enforces).map((a) => ({
      value: a.name,
      label: a.label,
      hint: detected.some((d) => d.name === a.name) ? "detected" : undefined,
    })),
    initialValues: detected.map((a) => a.name),
    required: true,
  });
  if (p.isCancel(chosen)) return void p.cancel("cancelled");

  const starter = await p.confirm({
    message: "scaffold a starter reflex (no-force-push)?",
    initialValue: true,
  });
  if (p.isCancel(starter)) return void p.cancel("cancelled");

  const finish = p.spinner();
  finish.start("wiring");
  fs.mkdirSync(reflexDir(cwd), { recursive: true });
  if (starter) {
    const file = path.join(reflexDir(cwd), "no-force-push.mjs");
    if (!fs.existsSync(file)) fs.writeFileSync(file, STARTER);
    addToConfig(cwd, "./no-force-push.mjs");
  } else if (!fs.existsSync(configPath(cwd))) {
    writeConfig(cwd, { reflexes: [] });
  }
  for (const name of chosen) getAdapter(name)?.install("project");
  finish.stop("wired");

  p.note(
    `${dim("edit")} ${white(".reflex/")} ${dim("and your reflexes fire instantly —")}\n${dim("no rebuild, no restart.")}`,
    "next",
  );
  p.outro(`${mark} ${dim("your agents have reflexes now.")}`);
}

const STARTER = `export default {
  name: "no-force-push",
  onToolCall(ctx) {
    if (ctx.tool === "Bash" && /git\\s+push\\b.*--force\\b/.test(ctx.command ?? ""))
      return { action: "deny", reason: "we agreed: no force-push — open a PR instead" };
    return { action: "pass" };
  },
};
`;

// ── add / new / dev ──
async function readLocation(loc: string): Promise<string> {
  if (/^https?:\/\//.test(loc)) {
    const res = await fetch(loc);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  return fs.readFileSync(loc, "utf8");
}

function resolveSibling(loc: string, file: string): string {
  return /^https?:\/\//.test(loc) ? new URL(file, loc).href : path.join(path.dirname(loc), file);
}

function githubRaw(spec: string): string {
  const [owner, repo, ...rest] = spec.slice("github:".length).split("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${rest.join("/")}`;
}

async function cmdAdd(spec: string, cwd: string, opts: Opts): Promise<void> {
  console.log(head("add"));
  try {
    // already sitting in .reflex/ — just reference it
    if (spec.startsWith("./")) {
      addToConfig(cwd, spec);
      console.log(`  ${lime("●")} added ${white(spec)} ${dim("→ .reflex/config.json")}\n`);
      return;
    }

    let code: string;
    let filename: string;
    if (spec.startsWith("/") || spec.startsWith("../")) {
      const src = path.resolve(cwd, spec);
      code = fs.readFileSync(src, "utf8");
      filename = path.basename(src);
    } else if (/^https?:\/\//.test(spec) || spec.startsWith("github:")) {
      const url = spec.startsWith("github:") ? githubRaw(spec) : spec;
      code = await readLocation(url);
      filename = path.basename(new URL(url).pathname) || "reflex.mjs";
    } else {
      // a name in the catalog
      const index =
        (typeof opts.registry === "string" && opts.registry) ||
        process.env.AGENTREFLEX_REGISTRY?.trim() ||
        REGISTRY_URL;
      const catalog = JSON.parse(await readLocation(index)) as {
        reflexes?: Array<{ name: string; bundle: string }>;
      };
      const found = catalog.reflexes?.find((r) => r.name === spec);
      if (!found) {
        console.log(`  ${dim(`'${spec}' is not in the catalog (${index})`)}\n`);
        return;
      }
      code = await readLocation(resolveSibling(index, found.bundle));
      filename = `${spec}.mjs`;
    }

    fs.mkdirSync(reflexDir(cwd), { recursive: true });
    fs.writeFileSync(path.join(reflexDir(cwd), filename), code);
    addToConfig(cwd, `./${filename}`);
    console.log(
      `  ${lime("●")} added ${white(filename.replace(/\.mjs$/, ""))} ${dim(`→ .reflex/${filename}`)}\n`,
    );
  } catch (err) {
    console.log(`  ${dim(`could not add '${spec}': ${(err as Error).message}`)}\n`);
  }
}

function cmdNew(name: string, cwd: string): void {
  const file = path.join(reflexDir(cwd), `${name}.mjs`);
  fs.mkdirSync(reflexDir(cwd), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, reflexTemplate(name));
  addToConfig(cwd, `./${name}.mjs`);
  console.log(`  ${lime("●")} created ${white(`.reflex/${name}.mjs`)}`);
  console.log(`  ${dim("edit it — it fires on the next tool call, no rebuild.")}`);
}

/** Walk up to the agentreflex monorepo root (the dir with /reflexes + workspace). */
function findRepoRoot(start: string): string | null {
  let dir = start;
  for (;;) {
    if (
      fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
      fs.existsSync(path.join(dir, "reflexes"))
    )
      return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function importReflexFile(abs: string): Promise<Reflex | null> {
  const mod = (await import(pathToFileURL(abs).href)) as { default?: Reflex; reflex?: Reflex };
  return mod.default ?? mod.reflex ?? null;
}

/** Resolve which reflexes `dev` should run: a single source via --file/--reflex,
 *  or the project's wired .reflex/ set. */
async function resolveDevReflexes(
  opts: Opts,
  cwd: string,
): Promise<{ reflexes: Reflex[]; label: string }> {
  if (typeof opts.file === "string" && opts.file) {
    const abs = path.resolve(cwd, opts.file);
    if (!fs.existsSync(abs)) throw new Error(`no such file: ${opts.file}`);
    const r = await importReflexFile(abs);
    if (!r) throw new Error(`no reflex default-export in ${opts.file}`);
    return { reflexes: [r], label: path.basename(abs) };
  }
  if (typeof opts.reflex === "string" && opts.reflex) {
    const root = findRepoRoot(cwd);
    if (!root) throw new Error("--reflex only works inside the agentreflex monorepo");
    const rdir = path.join(root, "reflexes", opts.reflex);
    if (!fs.existsSync(path.join(rdir, "reflex.json")))
      throw new Error(`no reflex named '${opts.reflex}' in /reflexes`);
    const entry = path.join(rdir, "dist", "index.js");
    if (!fs.existsSync(entry))
      throw new Error(`build it first → pnpm --filter ./reflexes/${opts.reflex} build`);
    const r = await importReflexFile(entry);
    if (!r) throw new Error(`no reflex default-export in reflexes/${opts.reflex}`);
    return { reflexes: [r], label: opts.reflex };
  }
  return { reflexes: await loadReflexes(cwd), label: ".reflex/" };
}

// ── dev: simulate any tool call against your reflexes ──
async function cmdDev(opts: Opts, pos: string[], cwd: string): Promise<void> {
  console.log(head("dev"));
  let reflexes: Reflex[];
  let label: string;
  try {
    ({ reflexes, label } = await resolveDevReflexes(opts, cwd));
  } catch (err) {
    console.log(`  ${dim((err as Error).message)}\n`);
    return;
  }
  if (reflexes.length === 0) {
    console.log(
      `  ${dim("no reflexes — run")} ${lime("arx init")} ${dim("or pass")} ${lime("--reflex <name>")}\n`,
    );
    return;
  }

  const tool = typeof opts.tool === "string" && opts.tool ? opts.tool : "Bash";
  const agent = (typeof opts.agent === "string" && opts.agent ? opts.agent : "claude") as AgentName;
  const command = pos.length ? pos.join(" ") : undefined;
  const paths =
    typeof opts.paths === "string" && opts.paths
      ? opts.paths
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const event = opts.event === "onToolResult" ? "onToolResult" : "onToolCall";

  const subject = command
    ? `${dim("$")} ${white(command)}`
    : `${white(tool)}${paths.length ? ` ${dim(paths.join(" "))}` : ""}`;
  console.log(`  ${dim(`${label} · ${agent} · ${tool} · ${event}`)}`);
  console.log(`  ${subject}`);

  if (event === "onToolResult") {
    await runToolResult(reflexes, { event, agent, tool, command, paths, cwd, raw: {} });
    console.log(`  ${mark} ${dim("onToolResult ran (side effects only — never blocks)")}\n`);
    return;
  }

  const d = await runToolCall(reflexes, { event, agent, tool, command, paths, cwd, raw: {} });
  const verdict =
    d.action === "deny"
      ? lime("deny")
      : d.action === "ask"
        ? amber("ask")
        : d.action === "modify"
          ? cyan("modify")
          : dim("pass");
  const reason = "reason" in d && d.reason ? dim(` — ${d.reason}`) : "";
  const args = d.action === "modify" ? dim(` ${JSON.stringify(d.args)}`) : "";
  console.log(`  ${mark} ${verdict}${reason}${args}\n`);
}

function help(): void {
  console.log(banner(VERSION));
  const row = (name: string, desc: string) => `  ${lime(pad(name, 10))} ${dim(desc)}`;
  console.log(
    [
      `  ${dim("usage")}  ${bold(white("arx"))} ${dim("<command>")}   ${dim("alias: agentreflex")}`,
      "",
      row("init", "scaffold .reflex/ and wire your agents"),
      row("add", "add a reflex  (name | url | github: | ./path)"),
      row("new", "scaffold a new reflex"),
      row("install", "wire the dispatcher into your agents"),
      row("doctor", "show the capability matrix for your agents"),
      row("dev", "simulate a tool call against your reflexes"),
      "",
      `  ${dim("dev")}    ${dim('arx dev "git push --force"')}  ${dim("·")} ${dim("--tool Read --paths .env")}`,
      `         ${dim("--reflex <name>")} ${dim("·")} ${dim("--file ./r.mjs")} ${dim("·")} ${dim("--agent")} ${dim("·")} ${dim("--event onToolResult")}`,
      `  ${dim("flags")}  ${dim("--dir <path>")} ${dim("run in another folder")}  ${dim("·")} ${dim("--scope")}`,
      "",
      `  ${dim("docs")}   ${cyan("https://docs.agentreflex.dev")}`,
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { opts, pos } = parseArgs(rest);
  if (typeof opts.dir === "string" && opts.dir) {
    try {
      process.chdir(path.resolve(opts.dir));
    } catch {
      console.error(`agentreflex: no such directory: ${opts.dir}`);
      process.exit(1);
    }
  }
  const cwd = process.cwd();
  switch (cmd) {
    case "hook":
      return cmdHook(typeof opts.agent === "string" ? opts.agent : "claude");
    case "init":
      return cmdInit(cwd);
    case "install":
      return void cmdInstall(opts);
    case "uninstall":
      return void cmdUninstall(opts);
    case "doctor":
      return cmdDoctor(cwd);
    case "add":
      return pos[0] ? cmdAdd(pos[0], cwd, opts) : help();
    case "new":
      return pos[0] ? void cmdNew(pos[0], cwd) : help();
    case "dev":
      return cmdDev(opts, pos, cwd);
    case "--version":
    case "-v":
      return void console.log(VERSION);
    default:
      return help();
  }
}

main().catch((err) => {
  console.error(`agentreflex: ${(err as Error).message}`);
  process.exit(1);
});
