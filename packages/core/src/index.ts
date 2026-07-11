/**
 * @agentreflex/core — the harness-agnostic contract.
 *
 * A reflex is written once against the model here and runs on every agent: each
 * Adapter maps a harness's native hook dialect to and from these types. The wire
 * format is JSON over stdin/stdout, so reflexes can also be authored in any
 * language; this TypeScript API is sugar over it.
 */
export * from "./types.js";
export * from "./command.js";
export * from "./paths.js";
export * from "./run.js";
export * from "./pack.js";
