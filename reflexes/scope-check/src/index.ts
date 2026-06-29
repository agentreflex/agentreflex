import { defineReflex, pass, type Decision, type ToolCallContext } from "@agentreflex/core";
import path from "node:path";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);

export interface ScopeCheckOptions {
  allow?: string[];
}

function matchesGlob(filePath: string, pattern: string, cwd: string): boolean {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const rel = path.relative(cwd, abs).replace(/\\/g, "/");
  const escaped = pattern
    .replace(/\\/g, "/")
    .replace(/[.+^${}()|[\]]/g, "\\$&")
    .replace(/\*\*/g, "\x00")
    .replace(/\*/g, "[^/]*")
    .replace(/\x00/g, ".*");
  return new RegExp(`^${escaped}$`).test(rel);
}

function isAllowed(filePath: string, patterns: string[], cwd: string): boolean {
  return patterns.some((p) => matchesGlob(filePath, p, cwd));
}

export default defineReflex({
  name: "scope-check",

  async onToolCall(ctx: ToolCallContext): Promise<Decision> {
    if (!WRITE_TOOLS.has(ctx.tool)) return pass();
    const filePath = ctx.paths[0];
    if (!filePath) return pass();

    const opts = (ctx.options ?? {}) as ScopeCheckOptions;

    if (opts.allow && opts.allow.length > 0) {
      if (!isAllowed(filePath, opts.allow, ctx.cwd)) {
        return {
          action: "deny",
          reason: `scope-check: "${filePath}" is outside the allowed scope (${opts.allow.join(", ")}). Update the \`allow\` list in .reflex/config.json to expand the scope, or confirm this is intentional with the user.`,
        };
      }
    }

    return pass();
  },
});
