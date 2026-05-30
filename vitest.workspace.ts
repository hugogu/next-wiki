import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "web-unit",
      include: ["apps/web/tests/unit/**/*.test.ts", "apps/web/tests/unit/**/*.test.tsx"],
      environment: "node",
    },
  },
  {
    test: {
      name: "web-integration",
      include: ["apps/web/tests/integration/**/*.test.ts"],
      environment: "node",
    },
  },
  {
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
