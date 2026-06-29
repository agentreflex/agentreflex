# scope-check

Blocks an agent from writing files outside the paths you've declared in scope. When the agent tries to write outside the allowed patterns, it receives a clear denial with the reason — so it can explain the constraint to the user and suggest how to update the scope if needed.

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
| `allow` | `string[]` | Glob patterns for allowed write paths, relative to project root |

## Glob syntax

| Pattern | Matches |
|---|---|
| `src/auth/**` | any file anywhere under `src/auth/` |
| `src/auth/*.ts` | `.ts` files directly in `src/auth/` (not subdirs) |
| `**` | everything (effectively disables the check) |

## Behaviour

- Only intercepts write tools (`Write`, `Edit`, `MultiEdit`). Reads and Bash commands are not affected.
- If no `allow` list is set, all writes pass through.
- Denial reason tells the agent exactly which pattern was violated and how to update `.reflex/config.json`.
