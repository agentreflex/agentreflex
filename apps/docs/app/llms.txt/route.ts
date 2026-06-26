import { source } from "@/lib/source";

export const dynamic = "force-static";

const base = "https://docs.agentreflex.dev";

export function GET() {
  const pages = source.getPages();
  const lines = pages
    .map((page) => {
      const title = page.data.title ?? page.url;
      const desc = page.data.description ? `: ${page.data.description}` : "";
      return `- [${title}](${base}${page.url})${desc}`;
    })
    .join("\n");

  const body = `# agentreflex docs

> Documentation for agentreflex — the open commons of reflexes for AI coding agents.
> A reflex is deterministic logic that fires before an agent acts on a tool call; it
> can pass, deny, ask, or modify. Write an instinct once and it compiles into every
> agent's native hook (Claude Code, Cursor, Copilot CLI, Gemini CLI, Windsurf, OpenCode).

## Pages

${lines}

## Links

- Home: https://agentreflex.dev
- Docs: ${base}
- Source: https://github.com/agentreflex/agentreflex
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
