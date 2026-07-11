# scope-check

Gates write-tool calls (`Write`, `Edit`, `MultiEdit`) to paths you've declared in scope. When the agent tries to write outside the allowed patterns, it receives a clear denial with the reason — so it can explain the constraint to the user and suggest how to update the scope if needed.

## Setup

```json
// .reflex/config.json
{
  "reflexes": [
    {
      "source": "./scope-check.mjs",
      "with": {
        "allow": ["src/auth/**", "tests/auth/**"]
      }
    }
  ]
}
```

## Options

| Key | Type | Description |
|---|---|---|
| `allow` | `string \| string[]` | Glob patterns for allowed write paths, relative to project root. A single string is treated as a one-element array. |

## Glob syntax

| Pattern | Matches |
|---|---|
| `src/auth/**` | any file anywhere under `src/auth/` |
| `src/auth/*.ts` | `.ts` files directly in `src/auth/` (not subdirs) |
| `**` | everything (effectively disables the check) |

## Behaviour

- Only intercepts write tools (`Write`, `Edit`, `MultiEdit`). Reads and Bash commands are not affected.
- **All paths** in a tool call are checked, not just the first. A `MultiEdit` touching both an allowed and a disallowed file is denied.
- If no `allow` option is set (omitted entirely), all writes pass through — no constraints.
- An explicit **empty allow list** (`"allow": []`) means **deny all writes**. This is useful as a temporary lockdown.
- Denial reason tells the agent exactly which file and pattern was violated and how to update `.reflex/config.json`.

## Limitations

- **Shell writes are not gated.** A `Bash` tool call running `echo x > out.txt` bypasses scope-check entirely because the reflex only sees the tool name, not the side-effects of the command. A future `shell-scope` reflex could parse redirects and `tee`/`sed -i`.
- **Adapter coverage varies.** On agents whose adapter only surfaces shell events (e.g. Cursor's `beforeShellExecution`), scope-check never fires because write-tool calls aren't dispatched through the hook.
