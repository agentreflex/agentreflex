# Contributing to agentreflex

Thanks for helping build the reflex commons. The most valuable contribution is a new
**reflex** — and the repo has tooling so you never hand-wire one.

Full guide: **https://docs.agentreflex.dev/contributing**

## Quick start (an official reflex)

```bash
git clone https://github.com/agentreflex/agentreflex && cd agentreflex
pnpm install

pnpm reflex:new my-reflex          # scaffold the full package + a runnable test
# edit reflexes/my-reflex/src/index.ts

pnpm reflex:dev my-reflex "some command"          # build + simulate a tool call
pnpm reflex:dev my-reflex --tool Read --paths .env # file-based reflexes too

pnpm test my-reflex                # run its tests
pnpm reflex:check                  # validate every reflex — this is what CI gates on
```

When `pnpm reflex:check` is green and your test proves both the catch and the
non-catch, open a PR.

## Testing a reflex

`arx dev` simulates a tool call without re-triggering an agent:

```bash
arx dev "git push --force"                 # Bash command (default tool)
arx dev --tool Write --paths src/a.ts,.env # a file-touching tool
arx dev --reflex my-reflex --tool Read --paths .env  # one in-repo reflex, from source
arx dev --event onToolResult --tool Write --paths a.ts  # post-tool side effects
```

## Bar for official reflexes

- **Single-purpose.** Compose small reflexes rather than bundling.
- **Shell-aware.** Use `parseCommand` so `cd x && …` can't evade a check.
- **Honest manifest.** `reflex.json` declares only the decisions and context the code
  actually uses. The `$schema` field gives live validation in your editor.
- **Tested.** At least one catch and one non-catch test.

## Community reflexes

Don't want to PR into the commons? Publish a single `.mjs` from your own repo — users
install it directly with `arx add github:you/repo/path.mjs` — and list it in
[awesome-reflexes](https://github.com/agentreflex/awesome-reflexes).

## Dev setup

`pnpm dev:setup` puts a real `arx` on your PATH and wires portable agent configs for
local testing. See `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`.
