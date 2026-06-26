import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Static export for Cloudflare Pages (no server runtime).
  output: "export",
  images: { unoptimized: true },
};

export default withMDX(config);
