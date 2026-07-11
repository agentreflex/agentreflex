<p align="center">
  <img src="https://agentreflex.dev/logo.svg" width="72" alt="agentreflex">
</p>

<h1 align="center">agentreflex</h1>

<p align="center"><b>Give your AI agents reflexes.</b><br>
Guardrails and logic that fire before the agent acts — written once, enforced on every coding agent.</p>

> **MCP gives your agent hands. agentreflex gives it reflexes.**

```bash
npx agentreflex init
```

Wires your reflexes into **Claude Code, Cursor, Gemini CLI, Copilot CLI, Windsurf, and OpenCode** — and compiles them to advisory `AGENTS.md` for Codex and everything else. Installed globally (`npm i -g agentreflex`), the command is **`arx`**.

A _reflex_ is logic that fires before the agent runs a tool — written once, in a single file you own:

```ts
import { defineReflex, deny, pass } from "@agentreflex/core"

export default defineReflex({
  name: "no-force-push",
  onToolCall(ctx) {
    if (ctx.tool === "Bash" && /git push.*--force/.test(ctx.command ?? ""))
      return deny("we agreed: no force-push — open a PR")
    return pass()
  },
})
```

Beyond single reflexes, `arx add` installs **packs** — a product's MCP server (with
auth), skills, session hooks, and reflexes as one unit, secrets prompted once and kept
user-private. `arx doctor` verifies each pack's MCP server with a real handshake;
`arx remove` undoes everything.

## Commands

| | |
|---|---|
| `arx init` | scaffold `.reflex/` and wire your installed agents |
| `arx add <name \| ./path \| github: \| url>` | add a reflex or a pack, from the registry or anywhere |
| `arx remove <pack>` | remove a pack — wiring, files, and stored secrets |
| `arx new <name>` | scaffold a new reflex |
| `arx install` / `arx uninstall` | wire / unwire the dispatcher |
| `arx doctor` | capability matrix + live MCP checks for installed packs |
| `arx dev "<cmd>"` | test a command against your reflexes |

## Links

- Website — https://agentreflex.dev
- Docs — https://docs.agentreflex.dev
- Source & reflex catalog — https://github.com/agentreflex/agentreflex

MIT
