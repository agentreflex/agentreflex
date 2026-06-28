#!/usr/bin/env node
/**
 * Builds the reflex catalog: bundles every reflex in /reflexes into a single
 * self-contained .mjs (deps inlined, only node: builtins external) and emits a
 * registry.json index. The output is what `arx add <name>` fetches — locally via
 * `--registry`, or in production from agentreflex.dev. Run after `pnpm build`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reflexesDir = path.join(repo, "reflexes");
// Served as static files by the www app → agentreflex.dev/registry/*.
const outDir = path.join(repo, "apps", "www", "public", "registry");

// We bundle each reflex's compiled dist, so make sure the workspace is built.
if (!fs.existsSync(path.join(reflexesDir, "abide", "dist", "index.js"))) {
  execFileSync("pnpm", ["-r", "--filter", "./packages/*", "--filter", "./reflexes/*", "build"], {
    cwd: repo,
    stdio: "inherit",
  });
}

fs.mkdirSync(outDir, { recursive: true });

const entries = [];
for (const name of fs.readdirSync(reflexesDir).sort()) {
  const manifestPath = path.join(reflexesDir, name, "reflex.json");
  const entry = path.join(reflexesDir, name, "dist", "index.js");
  // Not a reflex dir — skip silently. But a reflex with no built entry is a real
  // error: it would vanish from the catalog unnoticed. Fail loudly instead.
  if (!fs.existsSync(manifestPath)) continue;
  if (!fs.existsSync(entry))
    throw new Error(
      `reflexes/${name}: reflex.json present but dist/index.js missing — run its build`,
    );

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    outfile: path.join(outDir, `${name}.mjs`),
    // CJS deps (e.g. yaml) compile to require() of node builtins; ESM has no
    // require, so polyfill it from import.meta.url.
    banner: {
      js: "import { createRequire as __ar_cr } from 'node:module'; const require = __ar_cr(import.meta.url);",
    },
    logLevel: "warning",
  });

  entries.push({
    name: manifest.name,
    title: manifest.title,
    description: manifest.description,
    tags: manifest.tags ?? [],
    official: true,
    bundle: `${name}.mjs`,
  });
}

fs.writeFileSync(
  path.join(outDir, "registry.json"),
  `${JSON.stringify({ version: 1, reflexes: entries }, null, 2)}\n`,
);
console.log(`✓ catalog: ${entries.length} reflexes → ${path.relative(repo, outDir)}`);
