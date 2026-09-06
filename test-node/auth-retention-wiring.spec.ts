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

// Same reasoning for the feed prune: it is the fix for a table that grew
// without bound, and a prune nobody calls is a comment.
describe("the feed retention prune", () => {
  it("is called from the nightly cron branch", () => {
    const nightly = INDEX.slice(INDEX.indexOf('event.cron === "11 3 * * *"'));
    expect(nightly.slice(0, 1200)).toContain("pruneFeedItems");
  });

  it("gets its own independently(), not a chain onto the backup", () => {
    // A prune that throws must not be the reason a backup did not happen, and
    // a backup carrying one extra day of stale postings is a far smaller
    // problem than no backup at all.
    expect(INDEX).toMatch(/independently\("feed retention", pruneFeedItems\(env\)\)/);
  });
});
