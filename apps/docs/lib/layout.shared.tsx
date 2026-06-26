import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <span style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>agentreflex</span>,
      url: "https://agentreflex.dev",
    },
    githubUrl: "https://github.com/agentreflex/agentreflex",
    links: [
      {
        text: "agentreflex.dev",
        url: "https://agentreflex.dev",
        active: "none",
      },
    ],
  };
}
