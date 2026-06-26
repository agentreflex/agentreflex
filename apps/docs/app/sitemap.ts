import { source } from "@/lib/source";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = "https://docs.agentreflex.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: `${base}${page.url}`,
    changeFrequency: "weekly",
    priority: page.url === "/docs" ? 1 : 0.7,
  }));
}
