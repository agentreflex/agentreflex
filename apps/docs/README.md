# agentreflex docs

Documentation site for [agentreflex](https://agentreflex.dev), built with
[Fumadocs](https://fumadocs.dev) (Next.js). Static-exported and deployed to
**docs.agentreflex.dev** on Cloudflare Pages — the same pipeline as the marketing
site.

## Local development

From this package (`apps/docs`):

```bash
pnpm dev      # http://localhost:3333
```

Edits to `.mdx` files and `meta.json` hot-reload.

## Structure

```
apps/docs/
  source.config.ts          # Fumadocs MDX collections + schemas
  lib/source.ts             # content loader (baseUrl: /docs)
  app/
    layout.tsx              # RootProvider, fonts, brand theme, static search
    docs/                   # docs layout + [[...slug]] page
    api/search/route.ts     # static Orama search index (staticGET)
  content/docs/
    index.mdx · quickstart.mdx · contributing.mdx
    concepts/ guides/ reference/
    meta.json               # navigation order + groups (per folder)
  public/_redirects         # / -> /docs (Cloudflare Pages)
```

## Build

```bash
pnpm build    # next build with output: export -> ./out
```

`out/` is a fully static site (HTML + a prebuilt client-side search index at
`/api/search`), deployable as plain assets.

## Deployment (Cloudflare Pages)

- **Build command:** `pnpm --filter @agentreflex/docs build`
- **Build output directory:** `apps/docs/out`
- **Root directory:** repo root · **Env:** `NODE_VERSION=22`

Pushes to the default branch deploy automatically once the project is connected.
