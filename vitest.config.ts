import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, ".source/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
});
