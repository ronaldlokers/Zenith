import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// CLAUDE.md's "Verify before claiming done" list is what anyone working here
// runs before saying a branch is finished. It was missing
// `wrangler types --check`, which lives only in CI — so a dependency bump
// that made the generated worker types stale passed tsc, the build, lint, the
// whole suite and a browser smoke test, and failed CI in 26 seconds.
//
// A line in a document drifts again the next time a step is added. This is
// the same move as the other guards here: check that the rule holds rather
// than that one instance of it was fixed.
const ROOT = new URL("..", import.meta.url).pathname;
const CI = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
const BRIEF = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");

/** The commands the `checks` job runs, in order. */
function checksCommands(): string[] {
  const start = CI.indexOf("\n  checks:");
  const after = CI.indexOf("\n  preview:", start);
  const job = CI.slice(start, after === -1 ? undefined : after);
  return [...job.matchAll(/^\s*run:\s*(.+)$/gm)]
    .map((m) => m[1].trim())
    .filter((c) => !c.startsWith("|"));
}

// Setup, not verification — there is nothing here for a person to run and
// read. Installing a browser is the same kind of step as installing packages:
// it makes a gate possible rather than being one. The gate it enables,
// `npm run e2e`, is documented like the rest.
const SETUP = new Set(["npm ci", "npx playwright install --with-deps chromium"]);

// The brief prescribes the local form where it differs from CI's, with the
// reason written beside it. Both spellings count as documented.
const EQUIVALENT: Record<string, string[]> = {
  "npm test": ["npx vitest run --no-file-parallelism"],
  "npm run build": ["npm run build", "npx tsc -b"],
};

describe("the verification list", () => {
  it("documents every gate CI enforces", () => {
    const section = BRIEF.slice(BRIEF.indexOf("## Verify before claiming done"));
    const undocumented = checksCommands()
      .filter((c) => !SETUP.has(c))
      .filter((c) => ![c, ...(EQUIVALENT[c] ?? [])].some((f) => section.includes(f)));

    expect(
      undocumented,
      "CI runs this and CLAUDE.md does not mention it — a branch can be green locally and red in CI",
    ).toEqual([]);
  });

  it("names the gate that caused this test", () => {
    // Specific, because the general check above passes the moment the list
    // and CI agree — including if both lost the step.
    expect(BRIEF).toContain("wrangler types --check");
  });
});
