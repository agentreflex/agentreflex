#!/usr/bin/env node
/**
 * Cross-platform smoke test for the `arx hook` dispatcher — the machine path each
 * agent calls. Runs on every OS in CI. Guards the failure mode that shipped on
 * Windows: the hook crashing at module load (surfacing an error to the agent)
 * instead of dispatching, and the reflex not loading because of path handling.
 *
 * Uses a self-contained inline reflex (no imports), so it depends only on the
 * built CLI — not on the registry bundles. Payloads are built with JSON.stringify,
 * so a Windows `cwd` with backslashes is correctly escaped on the wire and
 * round-trips — exactly what a well-formed agent hook sends.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repo, "packages", "cli", "dist", "cli.js");

if (!fs.existsSync(cli)) {
  console.error(`missing ${path.relative(repo, cli)} — run pnpm build first`);
  process.exit(1);
}

const REFLEX = `export default {
  name: "smoke-block",
  onToolCall(ctx) {
    if (ctx.tool === "Bash" && /--force/.test(ctx.command ?? ""))
      return { action: "deny", reason: "smoke: no force-push" };
    return { action: "pass" };
  },
};
`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arx-smoke-"));
fs.mkdirSync(path.join(tmp, ".reflex"), { recursive: true });
fs.writeFileSync(path.join(tmp, ".reflex", "smoke-block.mjs"), REFLEX);
fs.writeFileSync(
  path.join(tmp, ".reflex", "config.json"),
  JSON.stringify({ reflexes: ["./smoke-block.mjs"] }),
);

const runHook = (payload) =>
  spawnSync(process.execPath, [cli, "hook", "--agent", "claude"], {
    input: JSON.stringify({ cwd: tmp, ...payload }),
    encoding: "utf8",
  });

let failed = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${detail}`}`);
  if (!cond) failed++;
};

// 1. A blocking command must dispatch and emit the agent's deny payload, exit 0.
const deny = runHook({ tool_name: "Bash", tool_input: { command: "git push --force" } });
check("hook does not crash on a deny", deny.status === 0, `exit ${deny.status} · ${deny.stderr}`);
check(
  "hook emits a deny decision",
  /deny/i.test(deny.stdout),
  `stdout: ${JSON.stringify(deny.stdout)}`,
);

// 2. A normal command passes silently — exit 0, no output.
const pass = runHook({ tool_name: "Bash", tool_input: { command: "git status" } });
check("hook passes a normal command", pass.status === 0, `exit ${pass.status} · ${pass.stderr}`);
check(
  "pass produces no stdout",
  pass.stdout.trim() === "",
  `stdout: ${JSON.stringify(pass.stdout)}`,
);

// 3. Empty stdin must fail open — never crash the agent.
const empty = spawnSync(process.execPath, [cli, "hook", "--agent", "claude"], {
  input: "",
  encoding: "utf8",
});
check(
  "hook fails open on empty stdin",
  empty.status === 0,
  `exit ${empty.status} · ${empty.stderr}`,
);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? "\nhook smoke: ok" : `\nhook smoke: ${failed} failure(s)`);
process.exit(failed === 0 ? 0 : 1);
