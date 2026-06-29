import { defineConfig } from "vitest/config";

export default defineConfig({
  css: false,
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.ts", "reflexes/*/test/**/*.test.ts"],
  },
});
