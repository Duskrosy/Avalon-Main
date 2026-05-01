// vitest.config.ts
//
// Minimal vitest configuration for the Avalon project.
// Resolves the @/ path alias (mirrors tsconfig.json paths) so that
// unit tests can import from @/lib/... without relative path gymnastics.
//
// Run tests: npx vitest run <path>

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
  },
});
