<p align="center">
  <img src="apps/www/public/logo.svg" alt="agentreflex" width="84">
</p>

<h1 align="center">agentreflex</h1>

<p align="center"><b>Give your AI agents reflexes.</b><br>
The open commons of reflexes for AI coding agents — write an instinct once, and it fires in every agent.</p>

<p align="center">
  <a href="https://agentreflex.dev">Website</a> ·
  <a href="https://docs.agentreflex.dev">Docs</a> ·
  <a href="https://agentreflex.dev/#commons">Reflexes</a> ·
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT"></a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="One reflex deflecting a force-push in Claude Code and a secrets read in OpenCode, then the arx doctor capability matrix" width="100%">
</p>

---

Coding agents — Claude Code, Cursor, Gemini CLI, Copilot CLI, Windsurf, OpenCode — each
ship their own hook system, and none of them talk to each other. Teach one a habit and
it simply doesn't exist in the others.

agentreflex is the reflex layer that runs under all of them. You write a _reflex_ once —
the instinct you'd apply by hand, as code — and agentreflex enforces it natively in every
agent that can block, and compiles it to advisory rules everywhere else.

## Quickstart

```bash
npx agentreflex init      # scaffold .reflex/ and wire your installed agents
```

Your reflexes now fire in Claude Code, Cursor, Gemini, Copilot, Windsurf, and OpenCode.

> Installed globally (`npm i -g agentreflex`), the command is **`arx`** — e.g. `arx doctor`, `arx add no-secrets`. (`agentreflex` works too; `npx` always uses the full package name.)

## A reflex is a file you own

A reflex is a small module in `.reflex/`, listed in `.reflex/config.json`. Own it, edit it,
commit it with your repo, share it as a URL — no publishing required.

```js
// .reflex/no-force-push.mjs
export default {
  name: "no-force-push",
  onToolCall(ctx) {
    if (ctx.tool === "Bash" && /git\s+push\b.*--force\b/.test(ctx.command ?? ""))
      return { action: "deny", reason: "no force-push — open a PR instead" };
    return { action: "pass" };
  },
};
```

Want types and shell-aware matching? Author in TypeScript against `@agentreflex/core`:

```ts
import { defineReflex, deny, pass, parseCommand } from "@agentreflex/core";

export default defineReflex({
  name: "no-force-push",
  onToolCall(ctx) {
    if (ctx.tool !== "Bash" || !ctx.command) return pass();
    for (const c of parseCommand(ctx.command))
      if (c.argv[0] === "git" && c.argv[1] === "push" && c.argv.includes("--force"))
        return deny("no force-push — open a PR instead");
    return pass();
  },
});
```

## Where it runs

| Agent | Enforced via | `deny` | `ask` |
|---|---|:--:|:--:|
| Claude Code | `PreToolUse` hook | ✓ | ✓ |
| Cursor | `beforeShellExecution` hook | ✓ | ✓ |
| Copilot CLI | `preToolUse` hook | ✓ | ✓ |
| Gemini CLI | `BeforeTool` hook | ✓ | – |
| Windsurf | Cascade hook | ✓ | – |
| OpenCode | `tool.execute.before` plugin | ✓ | – |
| Codex & others | advisory (compiled `AGENTS.md`) | – | – |

## Official reflexes

**Protective** — `abide` · `no-force-push` · `no-secrets` · `no-rm-rf` · `no-curl-bash` · `stay-in-repo` · `ask-on-prod` · `scope-check`

**Proactive** — `recover` · `prefer-rg` · `conventional-commits`

```bash
npx agentreflex add no-secrets
```

Browse them all on [agentreflex.dev](https://agentreflex.dev/#commons).

## Repository

```
apps/
  www/          # agentreflex.dev  (Next.js + Tailwind v4)
  docs/         # docs.agentreflex.dev  (Fumadocs, Next.js)
packages/
  core/         # @agentreflex/core — event/decision model + authoring API
  adapters/     # per-agent hook adapters
  cli/          # the `agentreflex` / `arx` binary
reflexes/       # official reflexes (the commons)
scripts/        # registry builder, dev setup
```

## Contributing

Official reflexes → PR into [`/reflexes`](reflexes). Community reflexes → share yours and
list it in [awesome-reflexes](https://github.com/agentreflex/awesome-reflexes). See
[the docs](https://docs.agentreflex.dev/contributing).

## License

MIT
