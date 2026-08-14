import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    // Root level, not inside a project. Set on the components project it
    // silently reported only the files some test had loaded: App.tsx,
    // insights.tsx and admin.tsx — three of the largest untested files in the
    // app — were absent from the report altogether, and the total read 51.7%
    // instead of the truth. A percentage that rises when you delete a test is
    // not a measurement.
    //
    // src only. @cloudflare/vitest-pool-workers loads the worker as a separate
    // pre-bundled module graph, so v8 sees none of it: running the workers
    // project with --coverage reports 0% of 1641 lines while nine hundred
    // tests drive that code. That figure is wrong rather than low, so worker/
    // stays out and the suite itself is its net.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.stories.tsx",
        "src/test-setup.ts",
        "src/vite-env.d.ts",
      ],
      reporter: ["text-summary", "html"],
      // The measured baseline, rounded down. A floor to stop coverage
      // sliding, not a target: raising these is the point, and each rise
      // should arrive with the tests that earned it.
      //
      // Set the day useToasts, medianTimeToOffer and most of api.ts turned
      // out to have no tests at all — and each of those three was hiding a
      // real defect: an undo button a burst of toasts could take away, a
      // time-to-offer that charged an offer with an earlier rejection, and a
      // JSON body announcing itself as text/plain.
      thresholds: {
        statements: 31,
        branches: 31,
        functions: 25,
        lines: 31,
      },
    },
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
                // Throwaway AES-256 key so the BYO-key crypto path is exercised
                // in tests. Not a real secret.
                AI_KEY_ENCRYPTION_KEY:
                  "rLJ1uXUzAp6uT+BPCW0DVTuQeVYLKN2J0syY3nYvK6Y=",
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
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/test-setup.ts"],
        },
      },
      {
        // The browser layer. Opt-in: it needs a Chromium binary, a built app
        // and a local D1, so it is `npm run e2e` rather than part of the
        // default suite — but it runs in CI, because the defects it catches
        // are the ones no other layer can see.
        test: {
          name: "e2e",
          environment: "node",
          include: ["e2e/**/*.spec.ts"],
          globalSetup: ["./e2e/setup.ts"],
          testTimeout: 120_000,
          hookTimeout: 180_000,
          // One browser, one board, shared state: parallel specs would race
          // each other's applications.
          fileParallelism: false,
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
