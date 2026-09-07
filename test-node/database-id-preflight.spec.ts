import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs script, no types, deliberately not compiled
import { UPSTREAM_DATABASE_ID, checkDatabaseId } from "../scripts/check-database-id.mjs";

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
