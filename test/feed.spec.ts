import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { authedFetch } from "./helpers";
import { refreshFeed } from "../worker/feed";

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

// The feed had one empty state for three different situations: nothing new, a
// mistyped board slug that will return nothing forever, and an upstream
// outage. All three rendered as "Nothing new. Feed checks automatically every
// 6 hours" — so a user concludes the feature works and never reports the real
// defect.
describe("a feed source that cannot be reached", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => vi.unstubAllGlobals());

  it("does not stop the sources that are fine, and says which one failed", async () => {
    await env.DB.prepare("DELETE FROM cron_runs").run();
    await env.DB.prepare(
      `INSERT INTO feed_ats_boards (user_id, source, slug) VALUES
         ('seed-admin', 'greenhouse', 'works'),
         ('seed-admin', 'greenhouse', 'broken')`,
    ).run();

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/boards/broken/")) {
        return Promise.resolve(new Response("no such board", { status: 404 }));
      }
      if (url.includes("/boards/works/")) {
        return Promise.resolve(
          new Response(JSON.stringify({ jobs: [{ id: 1, title: "Platform Engineer" }] }), {
            status: 200,
          }),
        );
      }
      return realFetch(input, init);
    });

    const result = await refreshFeed(env);
    // The healthy board still landed. A Promise.all over throwing fetchers
    // would have lost it along with the broken one.
    expect(result.seen, "the working board's listing was lost").toBeGreaterThan(0);

    const { results } = await env.DB.prepare(
      "SELECT label, ok FROM cron_runs WHERE label LIKE 'feed:%' ORDER BY label",
    ).all<{ label: string; ok: number }>();
    const byLabel = Object.fromEntries(results.map((r) => [r.label, r.ok]));
    expect(byLabel["feed:greenhouse:broken"], "the 404 board was not recorded as failing").toBe(0);
    expect(byLabel["feed:greenhouse:works"], "the healthy board was not recorded as ok").toBe(1);
  });

  it("counts an unconfigured source as fine rather than broken", async () => {
    // Adzuna with no credentials on the server. Nobody set it up; that is not
    // a fault, and reporting it as one would send the user looking for a
    // problem that does not exist.
    await env.DB.prepare("DELETE FROM cron_runs").run();
    await refreshFeed(env);
    const row = await env.DB.prepare(
      "SELECT ok FROM cron_runs WHERE label = 'feed:adzuna' ORDER BY id DESC LIMIT 1",
    ).first<{ ok: number }>();
    if (row) expect(row.ok, "an unconfigured source was reported as failing").toBe(1);
  });
});
