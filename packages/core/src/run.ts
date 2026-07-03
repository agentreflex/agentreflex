import type { Decision, Reflex, ToolCallContext, ToolResultContext } from "./types.js";

/**
 * Run reflexes for a tool call. The first reflex to return a non-`pass` decision
 * wins — declaration order is priority — otherwise the call passes.
 *
 * Fail-open is per reflex: a reflex that throws is skipped and the rest still
 * run, so one broken reflex (a bug, a bad config) can never silently disable
 * every other reflex in the chain.
 */
export async function runToolCall(reflexes: Reflex[], ctx: ToolCallContext): Promise<Decision> {
  for (const reflex of reflexes) {
    if (!reflex.onToolCall) continue;
    try {
      const decision = await reflex.onToolCall(ctx);
      if (decision.action !== "pass") return decision;
    } catch {
      // fail open for this reflex only — the others still get their turn
    }
  }
  return { action: "pass" };
}

/** Run every reflex's post-tool side effect. These never block, and one
 *  throwing observer never stops the rest. */
export async function runToolResult(reflexes: Reflex[], ctx: ToolResultContext): Promise<void> {
  for (const reflex of reflexes) {
    try {
      await reflex.onToolResult?.(ctx);
    } catch {
      // fail open per reflex
    }
  }
}
