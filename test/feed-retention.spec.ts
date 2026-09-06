import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { FEED_ITEM_RETENTION_DAYS, pruneFeedItems } from "../worker/feed";

// feed_items is insert-only. refreshFeed batch-inserts every candidate every
// six hours with ON CONFLICT DO NOTHING, and nothing anywhere deleted from it
// — `DELETE FROM feed_items` had no hits in the repo. It is also the table the
// nightly backup has to serialise into one JS object inside a 128 MB Worker,
// so unbounded growth there eventually stops the backup working rather than
// merely wasting space.
//
// What must not be pruned is anything a user has an opinion about. A
// feed_item_status row is that opinion — saved, or dismissed — and since #689
// those rows travel in the user's export, so deleting the posting under them
// would leave a list of decisions about nothing.
const CUTOFF_SAFE = `-${FEED_ITEM_RETENTION_DAYS - 5} days`;
const CUTOFF_OLD = `-${FEED_ITEM_RETENTION_DAYS + 5} days`;

async function seedItem(externalId: string, age: string): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO feed_items (source, external_id, title, company, url, fetched_at)
     VALUES ('hn', ?, ?, 'Northwind', 'https://example.com/j', datetime('now', ?))
     RETURNING id`,
  )
    .bind(externalId, `Posting ${externalId}`, age)
    .first<{ id: number }>();
  return row!.id;
}

const remaining = async (): Promise<string[]> => {
  const { results } = await env.DB.prepare(
    "SELECT external_id FROM feed_items ORDER BY external_id",
  ).all<{ external_id: string }>();
  return results.map((r) => r.external_id);
};

describe("pruning the shared feed", () => {
  it("drops a posting nobody touched once it is past the window", async () => {
    await env.DB.prepare("DELETE FROM feed_items").run();
    await seedItem("old-untouched", CUTOFF_OLD);
    await seedItem("recent-untouched", CUTOFF_SAFE);

    await pruneFeedItems(env);
    expect(
      await remaining(),
      "the old untouched posting is still there",
    ).toEqual(["recent-untouched"]);
  });

  it("keeps one a user saved or dismissed, however old", async () => {
    // The decision is the user's data. Deleting the posting under it leaves
    // their export holding a verdict about a job that no longer exists.
    await env.DB.prepare("DELETE FROM feed_items").run();
    const acted = await seedItem("old-dismissed", CUTOFF_OLD);
    await env.DB.prepare(
      `INSERT INTO feed_item_status (feed_item_id, user_id, status)
       VALUES (?, 'seed-admin', 'dismissed')`,
    )
      .bind(acted)
      .run();

    await pruneFeedItems(env);
    expect(
      await remaining(),
      "a posting the user had an opinion about was pruned out from under it",
    ).toEqual(["old-dismissed"]);
  });

  it("reports what it removed", async () => {
    await env.DB.prepare("DELETE FROM feed_items").run();
    await seedItem("a", CUTOFF_OLD);
    await seedItem("b", CUTOFF_OLD);
    await seedItem("c", CUTOFF_SAFE);
    expect(await pruneFeedItems(env)).toEqual({ removed: 2 });
  });

  it("does nothing, loudly or otherwise, on an empty table", async () => {
    await env.DB.prepare("DELETE FROM feed_items").run();
    await expect(pruneFeedItems(env)).resolves.toEqual({ removed: 0 });
  });
});
