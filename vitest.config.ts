import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    projects: [
      {
        // Unchanged: the existing worker/API suites.
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations(
                  path.join(__dirname, "migrations"),
                ),
              },
            },
          })),
        ],
        test: {
          name: "workers",
          include: ["test/**/*.spec.ts"],
          setupFiles: ["./test/apply-migrations.ts"],
        },
      },
      {
        // React component tests.
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test-setup.ts"],
        },
      },
      {
        // Repo-level guards that need real filesystem access.
        test: {
          name: "node",
          environment: "node",
          include: ["test-node/**/*.spec.ts"],
        },
      },
    ],
  },
});
