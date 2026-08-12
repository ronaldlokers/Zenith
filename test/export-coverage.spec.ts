import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildFullExport } from "../worker/index";

// The backup (#116) and the data export (#485) both walk a hand-written list
// of tables. A table added to a migration and forgotten here is not exported
// and not backed up, and nothing says so — the export still succeeds, just
// without that data in it. The failure only shows up when someone restores.
//
// Columns look after themselves: the queries are SELECT *, which is how
// board_folded (#535) was carried without anyone adding it anywhere.

// Tables the export deliberately leaves out, each for a stated reason. A new
// name has to be added here on purpose, which is the point.
const DELIBERATELY_NOT_EXPORTED = new Set([
  // Better Auth's own tables. Credentials and sessions are not user data to
  // hand back, and restoring them into a different deployment would be
  // actively wrong.
  "user",
  "account",
  "session",
  "verification",
  "twoFactor",
  "rateLimit",
  // Infrastructure rather than content.
  "d1_migrations",
  // Encrypted third-party keys (#381): re-entering one is safer than moving
  // ciphertext between deployments.
  "ai_credentials",
  // Device-bound and worthless once restored elsewhere.
  "push_subscriptions",
]);

// On the first run this test named six tables that hold user data and were
// in neither the backup nor the export: journal_entries, saved_views,
// webhooks, feed_ats_boards, feed_company_blocklist and notifications. The
// export succeeded the whole time — it just did not contain them.

describe("export coverage", () => {
  it("exports every table that holds user data", async () => {
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '_cf%'`,
    ).all<{ name: string }>();

    const dump = await buildFullExport(env);
    const exported = new Set(Object.keys(dump));
    const missing = results
      .map((r) => r.name)
      .filter((t) => !exported.has(t) && !DELIBERATELY_NOT_EXPORTED.has(t));

    expect(
      missing,
      "add these to EXPORT_TABLES, or to this spec's exclusion list with a reason",
    ).toEqual([]);
  });

  it("does not name a table that no longer exists", async () => {
    // The other direction: a renamed or dropped table leaves the export
    // querying something gone, which throws at backup time — 3am, unattended.
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    ).all<{ name: string }>();
    const real = new Set(results.map((r) => r.name));
    const dump = await buildFullExport(env);
    const named = Object.keys(dump).filter((k) => k !== "exported_at");
    expect(named.filter((t) => !real.has(t))).toEqual([]);
  });
});
