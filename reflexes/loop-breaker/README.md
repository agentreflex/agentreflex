# loop-breaker

Detects an agent re-running the same failing command and injects a nudge to step back and rethink.

Agents grinding in retry loops — running the identical command again and again, getting the identical error — is one of the most common failure modes in agentic coding. loop-breaker watches tool *results*: when the same shell command produces the same output enough times inside a sliding window, it injects a message into the agent's context telling it to stop repeating itself and change approach.

This is a **reaction** reflex — it runs on `onToolResult` and returns `inject`, not a permission decision. It never blocks anything; it feeds the agent the one observation it can't easily make about itself.

```bash
npx agentreflex add loop-breaker
```

## Setup

```json
// .reflex/config.json
{
  "reflexes": [
    {
      "source": "./loop-breaker.mjs",
      "with": {
        "threshold": 3,
        "windowMinutes": 10
      }
    }
  ]
}
```

Both options are optional — the defaults above are what you get with a plain string entry.

## Options

| Key | Type | Description |
|---|---|---|
| `threshold` | `number` | Identical command+output repeats before the nudge fires. Default `3`, minimum `2`. |
| `windowMinutes` | `number` | Sliding window in minutes — older repeats are forgotten. Default `10`. |

## Behaviour

- Watches **Bash results only**. Repeated identical edits already fail on their own, and file reads don't come through the hook matcher.
- A "repeat" is the same command **and** the same output (first 400 characters). The same command producing *different* output is progress, not a loop, and never fires.
- Once the threshold is reached, the nudge fires on every further repeat, with an updated count.
- State lives in a small per-project file under the OS temp dir — nothing is written into your repository.
- Keeps injecting only context; the command itself is never blocked or modified.

## Try it

```bash
pnpm reflex:dev loop-breaker --event onToolResult "npm test" --output "1 failing"
# run it three times — the third prints: inject — loop-breaker: …
```

## Limitations

- **Needs an agent whose adapter carries reactions.** On agents without `PostToolUse`-style hooks (or an adapter without `formatResult`), loop-breaker observes but its nudge degrades to a no-op.
- **Near-identical loops slip through.** A command re-run with a trivially different flag, or output that embeds a timestamp in the first 400 characters, produces a new fingerprint. Catching *semantic* repetition is a different, fuzzier reflex.
