import path from "node:path";
import {
  type Decision,
  type ToolCallContext,
  defineReflex,
  pass,
  pathMatchesGlob,
} from "@agentreflex/core";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);

export interface ScopeCheckOptions {
  allow?: string | string[];
}

export default defineReflex({
  name: "scope-check",

  async onToolCall(ctx: ToolCallContext): Promise<Decision> {
    if (!WRITE_TOOLS.has(ctx.tool)) return pass();
    if (ctx.paths.length === 0) return pass();

    const opts = (ctx.options ?? {}) as ScopeCheckOptions;
    const rawAllow = opts.allow;

    // No allow option configured → no constraints, pass through.
    if (rawAllow === undefined) return pass();

    const allow: string[] = Array.isArray(rawAllow)
      ? rawAllow
      : typeof rawAllow === "string"
        ? [rawAllow]
        : [];

    // Explicit allow: [] means "nothing is permitted" → deny all writes.
    if (allow.length === 0) {
      return {
        action: "deny",
        reason:
          "scope-check: allow list is empty — all writes are blocked. Add patterns to the `allow` list in .reflex/config.json to permit writes.",
      };
    }

    for (const filePath of ctx.paths) {
      if (!pathMatchesGlob(filePath, allow, ctx.cwd)) {
        return {
          action: "deny",
          reason: `scope-check: "${filePath}" is outside the allowed scope (${allow.join(", ")}). Update the \`allow\` list in .reflex/config.json to expand the scope, or confirm this is intentional with the user.`,
        };
      }
    }

    return pass();
  },
});
