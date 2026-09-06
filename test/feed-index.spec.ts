import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { feedPageSql } from "../worker/feed";

// feed_items carried no index at all. The only one it ever had was
// idx_feed_items_status, dropped in migrations/0047, and the UNIQUE(source,
// external_id) autoindex cannot serve this query. So every feed page read the
// whole table and built a temp b-tree to sort it — on a free tier that bills
// rows read, for a table that grows with every ingest and is never pruned.
//
// The sort key is an expression, COALESCE(posted_at, ''), which is why a
// plain index on posted_at would not have helped: SQLite matches an ORDER BY
// against the index's own expression, so the index has to carry the same one.
async function plan(sql: string): Promise<string> {
  const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind("u", "u", "u", 25)
    .all<{ detail: string }>();
  return results.map((r) => r.detail).join(" | ");
}

describe("the feed page query", () => {
  it("does not sort the whole table by hand", async () => {
    const detail = await plan(feedPageSql(""));
    expect(
      detail,
      "the feed still builds a temp b-tree for its ORDER BY",
    ).not.toMatch(/TEMP B-TREE/i);
  });

  it("walks the posted_at index instead of scanning", async () => {
    const detail = await plan(feedPageSql(""));
    expect(detail, `plan was: ${detail}`).toMatch(/idx_feed_items_posted/);
  });

  it("keeps the index when a cursor narrows the page", async () => {
    // Page two onward is the common case once the feed has any depth, and it
    // is the page a scan hurts most.
    const cursor = `AND (COALESCE(feed_items.posted_at, '') < ?
             OR (COALESCE(feed_items.posted_at, '') = ? AND feed_items.id < ?))`;
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN ${feedPageSql(cursor)}`,
    )
      .bind("u", "u", "u", "2026-01-01", "2026-01-01", 999, 25)
      .all<{ detail: string }>();
    const detail = results.map((r) => r.detail).join(" | ");
    expect(detail, `plan was: ${detail}`).toMatch(/idx_feed_items_posted/);
    expect(detail).not.toMatch(/TEMP B-TREE/i);
  });
});
