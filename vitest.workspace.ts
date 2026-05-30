import { defineWorkspace } from "vitest/config";
import path from "path";

const webAlias = { "@": path.resolve(__dirname, "apps/web/src") };

export default defineWorkspace([
  {
    resolve: { alias: webAlias },
    test: {
      name: "web-unit",
      include: ["apps/web/tests/unit/**/*.test.ts", "apps/web/tests/unit/**/*.test.tsx"],
      environment: "node",
    },
  },
  {
    resolve: { alias: webAlias },
    test: {
      name: "web-integration",
      include: ["apps/web/tests/integration/**/*.test.ts"],
      environment: "node",
    },
  },
  {
    resolve: { alias: webAlias },
    test: {
      name: "web-contracts",
      include: ["apps/web/tests/contracts/**/*.test.ts"],
      environment: "node",
    },
  },
  {
    test: {
      name: "web-smoke",
      include: ["apps/web/tests/smoke/**/*.test.ts"],
      environment: "node",
    },
  },
  {
    test: {
      name: "web-snapshots",
      include: ["apps/web/tests/snapshots/**/*.test.ts"],
      environment: "node",
    },
  },
  {
    test: {
      name: "shared",
      include: ["packages/shared/tests/**/*.test.ts"],
      environment: "node",
    },
  },
]);
