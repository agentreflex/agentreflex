import type { Decision, Reaction, Reflex, ToolCallContext, ToolResultContext } from "./types.js";

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

/**
 * Run every reflex's post-tool handler and aggregate their reactions.
 *
 * Every handler always runs (a block doesn't starve later observers). The first
 * `block` wins the aggregate; otherwise `inject` contexts concatenate in
 * declaration order; otherwise `none`. One throwing reflex never stops the rest.
 */
export async function runToolResult(reflexes: Reflex[], ctx: ToolResultContext): Promise<Reaction> {
  let blocked: Reaction | undefined;
  const injected: string[] = [];
  for (const reflex of reflexes) {
    try {
      const reaction = await reflex.onToolResult?.(ctx);
      if (!reaction || reaction.action === "none") continue;
      if (reaction.action === "block") blocked ??= reaction;
      else injected.push(reaction.context);
    } catch {
      // fail open per reflex
    }
  }
  if (blocked) return blocked;
  if (injected.length > 0) return { action: "inject", context: injected.join("\n\n") };
  return { action: "none" };
}
