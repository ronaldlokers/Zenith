import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// "Saved" is the feed's third triage outcome, and the whole point of it is
// what it does NOT touch: a posting kept for later must stay in the feed and
// must never become an application, because the application count is what the
// board, the funnel, the response rate and the momentum verdict all read.
const BASE = "http://zenith.test";

let itemId: number;

beforeAll(async () => {
  const row = await env.DB.prepare(
    `INSERT INTO feed_items (source, external_id, title, company, role_type, fetched_at)
     VALUES ('adzuna', 'saved-spec-1', 'Kept Role', 'Acme', 'platform-engineer', datetime('now'))
     RETURNING id`,
  ).first<{ id: number }>();
  itemId = row!.id;
});

describe("feed saved state", () => {
  it("keeps a saved posting in the feed", async () => {
    const save = await authedFetch(`${BASE}/api/feed/${itemId}/save`, { method: "POST" });
    expect(save.status).toBe(204);

    const feed = await authedFetch(`${BASE}/api/feed`);
    const body = await feed.json<{ items: { id: number; status: string }[] }>();
    const mine = body.items.find((i) => i.id === itemId);
    expect(mine, "a kept posting must still be in the feed").toBeTruthy();
    expect(mine!.status).toBe("saved");
  });

  it("never creates an application", async () => {
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM applications",
    ).first<{ n: number }>();
    await authedFetch(`${BASE}/api/feed/${itemId}/save`, { method: "POST" });
    const after = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM applications",
    ).first<{ n: number }>();
    expect(after!.n, "saving must not touch the pipeline count").toBe(before!.n);
  });

  it("unsaving returns it to new rather than writing a second word for it", async () => {
    await authedFetch(`${BASE}/api/feed/${itemId}/unsave`, { method: "POST" });
    const row = await env.DB.prepare(
      "SELECT status FROM feed_item_status WHERE feed_item_id = ?",
    )
      .bind(itemId)
      .first<{ status: string }>();
    // The absence of a row is what "new" means to the list query, so unsave
    // deletes rather than writing 'new' — two ways to say one thing is how
    // they drift apart.
    expect(row, "unsave should remove the row, not rewrite it").toBeFalsy();
  });
});
