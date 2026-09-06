import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The workers project ran on vitest's default 5000ms, and that budget has now
// blocked two PRs with tests that were never in doubt:
//
//   test/document-objects.spec.ts   1200 sequential R2 puts, 691ms locally
//   test/upload-collision.spec.ts   20 concurrent uploads, 263ms locally,
//                                   5061ms on CI
//
// The second is the useful measurement: 263ms local against 5061ms on a
// loaded runner is a factor of roughly twenty, which is exactly what
// test/export-coverage.spec.ts already says in prose. Against a 5000ms budget
// that puts every test over ~250ms locally at risk, and three more were
// sitting just under the line — the two stale-form-save cases and
// cover-letter-clobber all sleep 1100ms on purpose to cross a second
// boundary, so they start four fifths of the way through the budget before
// doing any work.
//
// Fixing them one at a time was the expensive way to find them. The project
// carries the budget now.
//
// A per-test timeout still overrides this, which is why document-objects
// keeps its own 60_000 and the WHOLE_ACCOUNT constants stay: they say
// something about those tests that a project default cannot.
const ROOT = new URL("..", import.meta.url).pathname;
const CONFIG = readFileSync(`${ROOT}vitest.config.ts`, "utf8");

// The workers project block, from its name to the end of its test options.
const workersBlock = CONFIG.slice(
  CONFIG.indexOf('name: "workers"'),
  CONFIG.indexOf('name: "components"'),
);

describe("the workers project's time budget", () => {
  it("is set explicitly rather than left on vitest's default", () => {
    expect(
      workersBlock,
      "the workers project is back on the 5000ms default that flaked twice",
    ).toMatch(/testTimeout:/);
  });

  it("leaves real headroom over the slowest thing measured on CI", () => {
    // 5061ms is the observation. A budget that only just clears it would be
    // the same bug with a bigger number.
    const declared = Number(
      workersBlock.match(/testTimeout:\s*([0-9_]+)/)?.[1].replace(/_/g, ""),
    );
    expect(declared).toBeGreaterThanOrEqual(15_000);
  });

  it("keeps the one test that genuinely needs longer than that", () => {
    const objects = readFileSync(`${ROOT}test/document-objects.spec.ts`, "utf8");
    expect(objects, "the 1200-put test lost its own timeout").toMatch(/60_000/);
  });
});
