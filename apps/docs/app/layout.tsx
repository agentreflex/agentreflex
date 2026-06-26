import "@/app/global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "agentreflex docs",
    template: "%s — agentreflex",
  },
  description:
    "Give your AI coding agents reflexes — write an instinct once, it fires in every agent.",
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
