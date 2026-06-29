# Working on agentreflex (guide for coding agents)

You're helping someone contribute to **agentreflex** — the commons of *reflexes* for
AI coding agents. A reflex is logic that runs before an agent acts on a tool call and
returns `pass` / `deny` / `ask` / `modify`. This file tells you how to do that work
correctly. Human contributor guide: `CONTRIBUTING.md` and https://docs.agentreflex.dev/contributing.

## ⚠️ Testing a reflex — read this first

**Do NOT test a reflex by wiring it into a live agent and restarting the session.**
That loop — `arx install`, `arx add`, editing `.reflex/config.json`, restarting to
re-read the hook — is slow, error-prone, and the wrong tool. It is the #1 way
contributors get stuck.

Test a reflex in **isolation**, from source, with no wiring and no restart:

```bash
pnpm reflex:dev <name> "git push --force"          # simulate a Bash command
pnpm reflex:dev <name> --tool Read --paths .env    # simulate a file-touching tool
pnpm reflex:dev <name> --event onToolResult --tool Write --paths a.ts
```

`reflex:dev` builds that one reflex and runs your simulated tool call through it,
printing the verdict (`pass` / `deny` / `ask` / `modify`). To inspect what the reflex
receives, add a `console.log(ctx)` in the handler and run `reflex:dev` — the output
prints inline. No agent, no install, no restart.

Validate before opening a PR (this is what CI gates on):

```bash
pnpm reflex:check [name]   # manifest, declared capabilities vs code, tests, README
```

> `arx hook --agent <name>` is the **machine dispatcher** each wired agent calls — it
> is not a test tool. Don't pipe JSON into it by hand.

## Authoring a reflex

```bash
pnpm reflex:new <name>     # scaffolds reflexes/<name>/ with a runnable test
pnpm install              # link the new workspace package
# edit reflexes/<name>/src/index.ts, then reflex:dev / reflex:check as above
```

A reflex is a default export — `name` + an `onToolCall` (and/or `onToolResult`):

```ts
import { defineReflex, deny, parseCommand, pass } from "@agentreflex/core";

export default defineReflex({
  name: "my-reflex",
  onToolCall(ctx) {
    // ctx = { tool, command?, paths, cwd, agent }
    // Be shell-aware: parseCommand splits "cd x && git push" so checks can't be evaded.
    if (ctx.tool === "Bash" && ctx.command) {
      for (const c of parseCommand(ctx.command))
        if (c.argv[0] === "danger") return deny("why this is blocked, and the alternative");
    }
    return pass();
  },
});
```

## Configurable reflexes (options)

A reflex can take options. The `.reflex/config.json` entry becomes an object with a
`with` block, and the reflex reads it as `ctx.options`:

```json
{
  "reflexes": [
    { "source": "./my-reflex.mjs", "with": { "allow": ["src/**"] } }
  ]
}
```

```ts
onToolCall(ctx) {
  const allow = (ctx.options?.allow as string[]) ?? [];
  // ...
}
```

Declare accepted options in `reflex.json` under `options`. Test a configured reflex
without touching `config.json`:

```bash
pnpm reflex:dev my-reflex --tool Edit --paths src/x.ts --with '{"allow":["src/**"]}'
```

**Note:** options go under `with`. A *top-level* key like `{ "my-reflex": { ... } }`
in `config.json` is NOT read.

## Don't do these (real mistakes we've seen)

- **Don't test by wiring a reflex into a live agent and restarting** to "see if it
  fires." Use `reflex:dev` / `reflex:check`.
- **Don't hand-write agent hook payloads** to test. Use `reflex:dev`.
- **Don't put reflex options as top-level keys** in `config.json` — use the `with`
  block on the entry (see above).

## Layout

```
reflexes/<name>/   # one reflex: src/index.ts · reflex.json · test/ · README.md
packages/core/     # @agentreflex/core — the contract (types, defineReflex, parseCommand)
packages/adapters/ # per-agent hook adapters
packages/cli/      # the arx / agentreflex CLI
scripts/           # reflex:new, reflex:dev, reflex:check, build-registry
```

## The bar for an official reflex

Single-purpose · shell-aware (`parseCommand`) · an accurate `reflex.json` (declare only
the decisions and context fields the code actually uses) · a test proving both the catch
and the non-catch. Then `pnpm reflex:check` must be green.

## Verify

```bash
pnpm build · pnpm test [name] · pnpm lint · pnpm typecheck
```
