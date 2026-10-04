import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config" // vitest/config re-exports Vite's, and knows about `test`
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: { "/api": "http://127.0.0.1:8790" } },
  build: { outDir: "dist" },
  // Vitest would otherwise collect web/e2e/*.spec.ts and try to run Playwright
  // tests under its own runner — two copies of @playwright/test, and a confusing
  // "test.describe() in a configuration file" failure. `vitest run` is unit
  // scope only; `pnpm verify:ui` runs the Playwright suite.
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
})
