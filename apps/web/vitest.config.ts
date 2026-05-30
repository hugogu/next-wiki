import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@next-wiki/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  test: {
    environment: "node",
  },
});
