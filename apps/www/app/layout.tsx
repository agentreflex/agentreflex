import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";

import "./globals.css";

const title = "agentreflex — Give your AI agents reflexes";
const description =
  "Skills are what your agent can do. Reflexes are how you'd do it — an open commons of guardrails that fire before every coding agent acts (Claude Code, Cursor, Copilot, Gemini, Windsurf, OpenCode).";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentreflex.dev"),
  title,
  description,
  applicationName: "agentreflex",
  keywords: [
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
    "agent governance",
    "agent safety",
  ],
  authors: [{ name: "agentreflex" }],
  creator: "agentreflex",
  publisher: "agentreflex",
  alternates: { canonical: "https://agentreflex.dev" },
  openGraph: {
    type: "website",
    url: "https://agentreflex.dev",
    siteName: "agentreflex",
    title,
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
    title,
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

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://agentreflex.dev/#org",
      name: "agentreflex",
      url: "https://agentreflex.dev",
      logo: "https://agentreflex.dev/icon.svg",
      sameAs: ["https://github.com/agentreflex"],
    },
    {
      "@type": "WebSite",
      "@id": "https://agentreflex.dev/#site",
      name: "agentreflex",
      url: "https://agentreflex.dev",
      publisher: { "@id": "https://agentreflex.dev/#org" },
    },
    {
      "@type": "SoftwareApplication",
      name: "agentreflex",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux, Windows",
      description,
      url: "https://agentreflex.dev",
      downloadUrl: "https://www.npmjs.com/package/agentreflex",
      license: "https://opensource.org/licenses/MIT",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {children}
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static, build-time JSON-LD
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
