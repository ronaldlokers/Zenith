import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs script, no types, deliberately not compiled
import { UPSTREAM_DATABASE_ID, checkDatabaseId, readDatabaseId } from "../scripts/check-database-id.mjs";

// SELF_HOSTING.md step 2 tells the reader to replace wrangler.jsonc's
// database_id with their own, but nothing enforced that step — a self-hoster
// who forgets it gets a confusing failure with no pointer back to the fix.
// npm run migrate:remote runs this check first. The thing worth pinning is
// not "it throws sometimes" — it's that it rejects specifically the id still
// committed in wrangler.jsonc, accepts anything else, and the rejection names
// step 2 so the reader has somewhere to go.
describe("checkDatabaseId", () => {
  it("rejects the upstream database_id, pointing back at SELF_HOSTING.md step 2", () => {
    expect(() => checkDatabaseId(UPSTREAM_DATABASE_ID)).toThrowError(/SELF_HOSTING\.md step 2/);
  });

  it("accepts a self-hoster's own database_id", () => {
    expect(() => checkDatabaseId("11111111-2222-3333-4444-555555555555")).not.toThrow();
  });
});

// The half that can rot without anyone noticing. UPSTREAM_DATABASE_ID is a
// hand-copied duplicate of the value in wrangler.jsonc, so rotating the
// production database would leave the guard comparing against an id nothing
// uses any more — it would stop rejecting and go on printing "Proceeding",
// which is the failure this whole check exists to prevent, wearing the
// costume of a pass.
//
// Reading the real file rather than a fixture is the point: it pins the parse
// against the actual JSONC (comments, formatting and all) and the constant's
// freshness in one assertion, so neither can drift alone.
describe("reading the id out of the real wrangler.jsonc", () => {
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

  it("still finds a database_id in the committed config", () => {
    expect(readDatabaseId(wrangler)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("is the same id the check rejects, so the guard has not gone stale", () => {
    expect(
      readDatabaseId(wrangler),
      "wrangler.jsonc's database_id no longer matches UPSTREAM_DATABASE_ID — " +
        "update the constant, or the preflight silently waves everyone through",
    ).toBe(UPSTREAM_DATABASE_ID);
  });
});
