import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildFullExport } from "../worker/index";
import { authedFetch } from "./helpers";

// feed_items is a shared pool with no user_id, and the export treated that as
// a reason to hand over the whole table. The rows are public job postings, so
// this was never a tenant leak — but it meant one person's "export my data"
// scaled with everyone's ingest and with all of history, on a table that only
// grows, carries the full posting description (migration 0045), and is served
// synchronously into a browser download.
//
// What is actually the user's own data here is their relationship to a
// posting: the feed_item_status row that says they saved or dismissed it. So
// the export follows that, rather than dropping feed_items entirely — a
// dismissed-postings list with no postings in it would not be portable.
//
// The nightly backup is a different question and keeps the whole table: it
// restores the instance, not one account, and scoping it would lose the pool.
const BASE = "http://zenith.test";

async function seedItem(externalId: string): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO feed_items (source, external_id, title, company, url)
     VALUES ('hn', ?, ?, 'Northwind', 'https://example.com/j')
     RETURNING id`,
  )
    .bind(externalId, `Posting ${externalId}`)
    .first<{ id: number }>();
  return row!.id;
}

async function act(feedItemId: number, status: string) {
  await env.DB.prepare(
    `INSERT INTO feed_item_status (feed_item_id, user_id, status)
     VALUES (?, 'seed-admin', ?)`,
  )
    .bind(feedItemId, status)
    .run();
}

describe("what the user export carries from the shared feed", () => {
  it("includes a posting the user acted on and not one they never saw", async () => {
    const mine = await seedItem("mine");
    await seedItem("untouched");
    await act(mine, "saved");

    const res = await authedFetch(`${BASE}/api/export`);
    const dump = await res.json<{ feed_items: { id: number }[] }>();
    const ids = dump.feed_items.map((r) => r.id);

    expect(ids, "the posting the user saved is missing from their export").toContain(mine);
    expect(
      ids.length,
      "the export still carries feed rows this user never touched",
    ).toBe(1);
  });

  it("scopes the CSV route the same way", async () => {
    // Two ways out of the same table. Scoping one and not the other would
    // leave the whole pool a link away.
    const mine = await seedItem("csv-mine");
    await seedItem("csv-untouched");
    await act(mine, "dismissed");

    const res = await authedFetch(`${BASE}/api/export/feed_items.csv`);
    const csv = await res.text();
    expect(csv).toContain("Posting csv-mine");
    expect(csv, "the CSV export still hands over the whole pool").not.toContain(
      "Posting csv-untouched",
    );
  });

  it("still exports the triage decisions themselves", async () => {
    // The rows that make the postings worth having. If these went and the
    // postings stayed, or the reverse, the export would be half an answer.
    const mine = await seedItem("status-pair");
    await act(mine, "dismissed");
    const res = await authedFetch(`${BASE}/api/export`);
    const dump = await res.json<{ feed_item_status: { feed_item_id: number }[] }>();
    expect(dump.feed_item_status.map((r) => r.feed_item_id)).toContain(mine);
  });
});

describe("what the backup carries", () => {
  it("still takes the whole pool, because it restores the instance", async () => {
    // The one that stops this fix being applied one function too far. The
    // backup is what a restore reads; scoping it would lose every posting
    // nobody had triaged yet.
    const untouched = await seedItem("backup-untouched");
    const dump = (await buildFullExport(env)) as { feed_items: { id: number }[] };
    expect(
      dump.feed_items.map((r) => r.id),
      "the backup lost the postings nobody has triaged yet",
    ).toContain(untouched);
  });
});

describe("the export route is still reachable", () => {
  it("answers with a download for a signed-in user", async () => {
    const res = await authedFetch(`${BASE}/api/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment/);
  });

  it("does not answer without a session", async () => {
    const res = await SELF.fetch(`${BASE}/api/export`);
    expect(res.status).not.toBe(200);
  });
});
