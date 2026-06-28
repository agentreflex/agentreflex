#!/usr/bin/env node
/**
 * Build one reflex from source and run it through `arx dev` in a single step, so
 * authoring in /reflexes has a tight loop. Usage:
 *   pnpm reflex:dev <name> "git push --force"
 *   pnpm reflex:dev <name> --tool Read --paths .env
 * Any `arx dev` flag (--tool, --paths, --agent, --event) passes straight through.
 * For continuous rebuilds, run `pnpm --filter ./reflexes/<name> build --watch`
 * in one terminal and `arx dev --reflex <name> …` in another.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [name, ...rest] = process.argv.slice(2);

if (!name) {
  console.error('usage: pnpm reflex:dev <name> "<command>" [--tool Read --paths .env]');
  process.exit(1);
}
if (!fs.existsSync(path.join(repo, "reflexes", name, "reflex.json"))) {
  console.error(
    `no reflex named '${name}' in /reflexes — scaffold one with: pnpm reflex:new ${name}`,
  );
  process.exit(1);
}

const cli = path.join(repo, "packages", "cli", "dist", "cli.js");
if (!fs.existsSync(cli)) {
  execFileSync("pnpm", ["-r", "--filter", "./packages/*", "build"], {
    cwd: repo,
    stdio: "inherit",
  });
}
execFileSync("pnpm", ["--filter", `./reflexes/${name}`, "build"], { cwd: repo, stdio: "inherit" });

const res = spawnSync("node", [cli, "dev", "--reflex", name, ...rest], {
  cwd: repo,
  stdio: "inherit",
});
process.exit(res.status ?? 1);
