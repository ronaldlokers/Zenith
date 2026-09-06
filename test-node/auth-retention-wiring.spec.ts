import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A retention job nobody calls is a comment. The behaviour is covered in
// test/auth-retention.spec.ts; this is the half that spec structurally cannot
// see — that the scheduled handler actually reaches it.
const ROOT = new URL("..", import.meta.url).pathname;
const INDEX = readFileSync(`${ROOT}worker/index.ts`, "utf8");

describe("the auth retention prune", () => {
  it("is called from the nightly cron branch", () => {
    const nightly = INDEX.slice(INDEX.indexOf('event.cron === "11 3 * * *"'));
    expect(
      nightly.slice(0, 600),
      "nothing in the nightly branch calls the prune",
    ).toContain("pruneAuthRows");
  });

  it("gets its own independently(), not a chain onto the backup", () => {
    // Chained, a retention failure would be recorded as a backup failure and
    // — worse — a backup failure would skip the prune entirely.
    expect(INDEX).toMatch(/independently\("auth retention", pruneAuthRows\(env\)\)/);
  });
});
