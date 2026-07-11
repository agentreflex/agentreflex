#!/usr/bin/env node
/**
 * Validate official reflexes before commit/PR. Checks the manifest, the package,
 * the built entry, the declared events/decisions vs the code, and that tests +
 * README exist. Usage:
 *   pnpm reflex:check            # all reflexes
 *   pnpm reflex:check no-secrets # one
 * Exits non-zero on any error (warnings don't fail the run).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reflexesDir = path.join(repo, "reflexes");

const EVENTS = new Set(["onToolCall", "onToolResult"]);
const DECISIONS = new Set(["pass", "deny", "ask", "modify"]);
const READS = new Set(["command", "paths", "cwd", "raw", "options"]);

const only = process.argv[2];
const names = fs
  .readdirSync(reflexesDir)
  .filter((n) => fs.statSync(path.join(reflexesDir, n)).isDirectory())
  .filter((n) => fs.existsSync(path.join(reflexesDir, n, "reflex.json")))
  .filter((n) => !only || n === only)
  .sort();

if (only && names.length === 0) {
  console.error(`no reflex named '${only}' in /reflexes`);
  process.exit(1);
}

// Build so the entry checks are real (mirrors the registry builder).
const needsBuild = names.some((n) => !fs.existsSync(path.join(reflexesDir, n, "dist", "index.js")));
if (needsBuild) {
  console.log("building reflexes…");
  execFileSync("pnpm", ["-r", "--filter", "./packages/*", "--filter", "./reflexes/*", "build"], {
    cwd: repo,
    stdio: "inherit",
  });
}

let errors = 0;
let warnings = 0;

for (const name of names) {
  const dir = path.join(reflexesDir, name);
  const problems = [];
  const warn = [];
  const err = (m) => problems.push(m);

  // ── manifest ──
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "reflex.json"), "utf8"));
  } catch (e) {
    err(`reflex.json does not parse: ${e.message}`);
    report(name, problems, warn);
    errors += problems.length;
    continue;
  }

  for (const field of ["name", "title", "description", "events", "capabilities", "entry"])
    if (manifest[field] === undefined) err(`reflex.json missing required field: ${field}`);

  if (manifest.name !== name)
    err(`reflex.json name "${manifest.name}" must match folder "${name}"`);
  if (manifest.name && !/^[a-z][a-z0-9-]*$/.test(manifest.name))
    err(`name "${manifest.name}" must be lowercase kebab-case`);

  const events = Array.isArray(manifest.events) ? manifest.events : [];
  if (events.length === 0) err("events must list at least one of onToolCall / onToolResult");
  for (const e of events) if (!EVENTS.has(e)) err(`unknown event "${e}"`);

  const decisions = manifest.capabilities?.decisions ?? [];
  if (!Array.isArray(decisions) || decisions.length === 0)
    err("capabilities.decisions must list the verdicts the reflex returns");
  for (const d of decisions) if (!DECISIONS.has(d)) err(`unknown decision "${d}"`);
  for (const r of manifest.capabilities?.reads ?? [])
    if (!READS.has(r)) warn.push(`unknown read "${r}"`);

  // ── package ──
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    if (pkg.name !== `@agentreflex/${name}`)
      err(`package.json name should be "@agentreflex/${name}", got "${pkg.name}"`);
    if (pkg.private !== true) warn.push('package.json should be "private": true');
  } catch {
    err("package.json missing or invalid");
  }

  // ── entry + code vs declared surface ──
  const entry = path.join(dir, manifest.entry ?? "dist/index.js");
  if (!fs.existsSync(entry)) {
    err(`entry not found: ${manifest.entry} (did it build?)`);
  } else {
    try {
      const mod = await import(pathToFileURL(entry).href);
      const reflex = mod.default ?? mod.reflex;
      if (!reflex) err("entry has no default export");
      else {
        if (reflex.name !== name) err(`exported reflex.name "${reflex.name}" must match "${name}"`);
        if (events.includes("onToolCall") && typeof reflex.onToolCall !== "function")
          err("declares onToolCall but exports no onToolCall handler");
        if (events.includes("onToolResult") && typeof reflex.onToolResult !== "function")
          err("declares onToolResult but exports no onToolResult handler");
        if (typeof reflex.onToolCall === "function" && !events.includes("onToolCall"))
          warn.push("exports onToolCall but doesn't declare it in events");
      }
    } catch (e) {
      err(`entry failed to import: ${e.message}`);
    }
  }

  // ── declared decisions vs source (best-effort) ──
  const srcPath = path.join(dir, "src", "index.ts");
  if (fs.existsSync(srcPath)) {
    const src = fs.readFileSync(srcPath, "utf8");
    const used = new Set();
    if (/\bdeny\s*\(|action:\s*["']deny["']/.test(src)) used.add("deny");
    if (/\bask\s*\(|action:\s*["']ask["']/.test(src)) used.add("ask");
    if (/\bmodify\s*\(|action:\s*["']modify["']/.test(src)) used.add("modify");
    for (const d of used)
      if (!decisions.includes(d))
        warn.push(`code returns "${d}" but reflex.json doesn't declare it`);
    for (const d of decisions)
      if (d !== "pass" && !used.has(d))
        warn.push(`reflex.json declares "${d}" but code never returns it`);
  } else {
    warn.push("no src/index.ts (authored in JS only? fine, but TS is the official bar)");
  }

  // ── test + readme ──
  const testDir = path.join(dir, "test");
  const hasTest =
    fs.existsSync(testDir) && fs.readdirSync(testDir).some((f) => f.endsWith(".test.ts"));
  if (!hasTest) err("no test/*.test.ts — official reflexes need a catch + non-catch test");
  if (!fs.existsSync(path.join(dir, "README.md"))) err("no README.md");

  report(name, problems, warn);
  errors += problems.length;
  warnings += warn.length;
}

function report(name, problems, warn) {
  if (problems.length === 0 && warn.length === 0) {
    console.log(`✓ ${name}`);
    return;
  }
  console.log(`${problems.length ? "✗" : "▲"} ${name}`);
  for (const p of problems) console.log(`    error:   ${p}`);
  for (const w of warn) console.log(`    warning: ${w}`);
}

console.log("");
console.log(`${names.length} reflex(es) · ${errors} error(s) · ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
