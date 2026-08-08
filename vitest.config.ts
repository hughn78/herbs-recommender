// Separate Vitest config so we don't conflict with the Lovable
// vite-tanstack-config (which doesn't expose a `test` slot).
import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Exclude macOS AppleDouble junk (._*) that external volumes create
    // alongside real files; vitest otherwise tries to transform them.
    exclude: ["**/._*", "**/node_modules/**"],
    globals: false,
  },
});
