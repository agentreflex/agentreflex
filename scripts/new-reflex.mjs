#!/usr/bin/env node
/**
 * Scaffold a new official reflex under /reflexes — the full package a contribution
 * needs: src, manifest, test, package.json, tsconfig, README. Usage:
 *   pnpm reflex:new <name> [--title "..."] [--desc "..."]
 * Then: pnpm --filter ./reflexes/<name> build && pnpm reflex:check <name>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parse(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--title" || a === "--desc") opts[a.slice(2)] = argv[++i] ?? "";
    else pos.push(a);
  }
  return { name: pos[0], ...opts };
}

const { name, title, desc } = parse(process.argv.slice(2));

if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error("usage: pnpm reflex:new <name>   (lowercase kebab-case, e.g. no-rm-rf)");
  process.exit(1);
}

const dir = path.join(repo, "reflexes", name);
if (fs.existsSync(dir)) {
  console.error(`reflexes/${name} already exists`);
  process.exit(1);
}

const Title = title || name.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const Desc = desc || `One sentence: what ${name} catches or does.`;

const files = {
  "reflex.json": `${JSON.stringify(
    {
      $schema: "https://agentreflex.dev/schema/reflex-v1.json",
      name,
      title: Title,
      description: Desc,
      version: "0.0.0",
      license: "MIT",
      author: "agentreflex",
      official: true,
      events: ["onToolCall"],
      capabilities: { decisions: ["deny"], reads: ["command"] },
      entry: "dist/index.js",
      tags: ["protective"],
    },
    null,
    2,
  )}\n`,

  "package.json": `${JSON.stringify(
    {
      name: `@agentreflex/${name}`,
      version: "0.0.0",
      description: Desc,
      license: "MIT",
      type: "module",
      main: "./dist/index.js",
      exports: { ".": { import: "./dist/index.js" } },
      private: true,
      files: ["dist", "reflex.json"],
      scripts: {
        build: "tsc -p tsconfig.json",
        typecheck: "tsc -p tsconfig.json --noEmit",
      },
      dependencies: { "@agentreflex/core": "workspace:*" },
      devDependencies: { "@types/node": "^22.10.0" },
    },
    null,
    2,
  )}\n`,

  "tsconfig.json": `${JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: { rootDir: "src", outDir: "dist" },
      include: ["src"],
    },
    null,
    2,
  )}\n`,

  "src/index.ts": `import { defineReflex, deny, parseCommand, pass } from "@agentreflex/core";

export default defineReflex({
  name: ${JSON.stringify(name)},
  onToolCall(ctx) {
    // ctx: { tool, command, paths, cwd, agent }
    // Be shell-aware: parseCommand splits "cd x && git push" so checks can't be evaded.
    if (ctx.tool === "Bash" && ctx.command) {
      for (const c of parseCommand(ctx.command)) {
        if (c.argv[0] === "example")
          return deny("explain why this is blocked, and what to do instead");
      }
    }
    return pass();
  },
});
`,

  [`test/${name}.test.ts`]: `import type { ToolCallContext } from "@agentreflex/core";
import { describe, expect, it } from "vitest";
import reflex from "../src/index.js";

const ctx = (over: Partial<ToolCallContext> = {}): ToolCallContext => ({
  event: "onToolCall",
  agent: "claude",
  tool: "Bash",
  command: undefined,
  paths: [],
  cwd: "/proj",
  raw: {},
  ...over,
});

describe(${JSON.stringify(name)}, () => {
  it("catches the thing it should", () => {
    expect(reflex.onToolCall?.(ctx({ command: "example bad-thing" }))?.action).toBe("deny");
  });

  it("passes a normal command", () => {
    expect(reflex.onToolCall?.(ctx({ command: "ls -la" }))).toEqual({ action: "pass" });
  });
});
`,

  "README.md": `# ${name}

**${Title}.**

${Desc}

\`\`\`bash
npx agentreflex add ${name}
\`\`\`
`,
};

for (const [rel, content] of Object.entries(files)) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

console.log(`✓ scaffolded reflexes/${name}`);
console.log("  next:");
console.log("    pnpm install");
console.log(`    # edit reflexes/${name}/src/index.ts`);
console.log(`    pnpm --filter ./reflexes/${name} build`);
console.log(`    pnpm reflex:dev ${name} "example bad-thing"   # try it`);
console.log(`    pnpm test ${name}                             # run its tests`);
console.log(`    pnpm reflex:check ${name}                     # validate before PR`);
