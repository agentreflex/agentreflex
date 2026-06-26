import "@/app/global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";

const description =
  "Give your AI coding agents reflexes — write an instinct once, it fires in every agent (Claude Code, Cursor, Copilot, Gemini, Windsurf, OpenCode).";

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.agentreflex.dev"),
  title: {
    default: "agentreflex docs",
    template: "%s — agentreflex",
  },
  description,
  applicationName: "agentreflex",
  keywords: [
    "agentreflex docs",
    "AI coding agents",
    "agent guardrails",
    "reflexes",
    "Claude Code hooks",
    "Cursor hooks",
    "Gemini CLI",
    "Copilot CLI",
    "MCP",
    "AGENTS.md",
    "pre-tool hook",
  ],
  openGraph: {
    type: "website",
    siteName: "agentreflex docs",
    title: "agentreflex docs",
    description,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "agentreflex — give your AI agents reflexes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "agentreflex docs",
    description,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: { icon: "/icon.svg" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider theme={{ defaultTheme: "light" }} search={{ options: { type: "static" } }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
