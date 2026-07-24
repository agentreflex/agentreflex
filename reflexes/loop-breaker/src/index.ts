import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type Reaction,
  type ToolResultContext,
  defineReflex,
  inject,
  none,
} from "@agentreflex/core";

export interface LoopBreakerOptions {
  /** Repeats of the same command + output before the nudge fires. Default 3. */
  threshold?: number;
  /** Sliding window in minutes — older repeats are forgotten. Default 10. */
  windowMinutes?: number;
  /** Where to keep state (mainly for tests). Default: os.tmpdir()/agentreflex. */
  stateDir?: string;
}

interface StateEntry {
  fingerprint: string;
  at: number;
}

const DEFAULT_THRESHOLD = 3;
const DEFAULT_WINDOW_MINUTES = 10;
const MAX_ENTRIES = 200;
/** How much of the output participates in the fingerprint — enough to tell
 *  errors apart, small enough that trailing noise doesn't defeat matching. */
const OUTPUT_PREFIX = 400;

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function stateFile(cwd: string, stateDir?: string): string {
  const dir = stateDir ?? path.join(os.tmpdir(), "agentreflex");
  return path.join(dir, `loop-breaker-${sha(cwd).slice(0, 16)}.json`);
}

function readState(file: string): StateEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as StateEntry[]) : [];
  } catch {
    return [];
  }
}

function writeState(file: string, entries: StateEntry[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

export default defineReflex({
  name: "loop-breaker",

  onToolResult(ctx: ToolResultContext): Reaction {
    // Only shell commands loop this way — repeated identical Edits already
    // fail on their own, and Reads never come through the hook matcher.
    if (ctx.tool !== "Bash" || !ctx.command) return none();

    const opts = (ctx.options ?? {}) as LoopBreakerOptions;
    const threshold =
      typeof opts.threshold === "number" && opts.threshold >= 2
        ? opts.threshold
        : DEFAULT_THRESHOLD;
    const windowMs =
      (typeof opts.windowMinutes === "number" && opts.windowMinutes > 0
        ? opts.windowMinutes
        : DEFAULT_WINDOW_MINUTES) * 60_000;

    const fingerprint = sha(`${ctx.command} ${(ctx.output ?? "").slice(0, OUTPUT_PREFIX)}`);

    const file = stateFile(ctx.cwd, typeof opts.stateDir === "string" ? opts.stateDir : undefined);
    const now = Date.now();
    const entries = readState(file).filter((e) => now - e.at < windowMs);
    entries.push({ fingerprint, at: now });
    writeState(file, entries);

    const repeats = entries.filter((e) => e.fingerprint === fingerprint).length;
    if (repeats < threshold) return none();

    const minutes = Math.round(windowMs / 60_000);
    return inject(
      [
        `loop-breaker: this exact command has now produced the same output ${repeats} times`,
        `in the last ${minutes} minutes. Repeating it again will not change anything —`,
        "step back, re-read the error, and try a different approach that still achieves the",
        "original objective. Only ask the user for direction if no alternative exists.",
      ].join(" "),
    );
  },
});
