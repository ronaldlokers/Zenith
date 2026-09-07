import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { generateWeeklyDigest } from "../worker/digest";
import { refreshFeed } from "../worker/feed";

// SRE card: Cloudflare can retry a scheduled event that doesn't return in
// time, so the tasks worker/index.ts's scheduled() dispatches to can run a
// second time while the first is still in flight (see the comment on
// scheduled() itself). generateWeeklyDigest and refreshFeed survive that
// because their INSERT carries an ON CONFLICT DO NOTHING keyed on exactly
// the columns a duplicate invocation would repeat — remove either clause and
// the assertions below fail, because the second call then duplicates a row
// instead of no-opping.
//
// This calls each task twice sequentially rather than via Promise.all: D1 in
// this harness is one connection, so true wall-clock concurrency isn't
// observable here, and test/digest.spec.ts's "does not duplicate on re-run
// in the same week" already covers the sequential case for the digest. What
// actually makes cron-retry overlap safe is the DB constraint, not the
// harness's scheduling — a UNIQUE-backed ON CONFLICT rejects the second
// insert of the same key regardless of whether the two callers overlapped in
// wall-clock time or ran back to back, so a sequential double-run is the
// same proof a concurrent one would be.
const USER = "seed-admin";

describe("cron-retry safety", () => {
  it("a duplicate weekly-digest run does not double the notification", async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM notifications WHERE type = 'weekly_digest'"),
      env.DB.prepare("DELETE FROM applications WHERE user_id = ?").bind(USER),
    ]);
    await env.DB.prepare(
      `INSERT INTO applications (user_id, title, status, created_at)
       VALUES (?, 'Job', 'applied', datetime('now', '-1 days'))`,
    )
      .bind(USER)
      .run();

    await generateWeeklyDigest(env);
    await generateWeeklyDigest(env); // the retry

    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM notifications WHERE type = 'weekly_digest'",
    ).all<{ n: number }>();
    expect(
      results[0].n,
      "ON CONFLICT (user_id, dedup_key) in worker/digest.ts should have no-opped the retry",
    ).toBe(1);
  });

  it("a duplicate feed-pull run does not double the listing", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM feed_items WHERE source = 'greenhouse' AND external_id = 'retry-1'",
      ),
      env.DB.prepare("DELETE FROM feed_ats_boards WHERE slug = 'retry-board'"),
    ]);
    await env.DB.prepare(
      `INSERT INTO feed_ats_boards (user_id, source, slug) VALUES (?, 'greenhouse', 'retry-board')`,
    )
      .bind(USER)
      .run();

    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/boards/retry-board/")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ jobs: [{ id: "retry-1", title: "Retry Guard Engineer" }] }),
            { status: 200 },
          ),
        );
      }
      // Everything else (e.g. Adzuna bailing before fetch since no
      // credentials are configured in the test env) falls through untouched.
      return realFetch(input, init);
    });

    try {
      await refreshFeed(env);
      const second = await refreshFeed(env); // the retry
      expect(
        second.inserted,
        "ON CONFLICT (source, external_id) in worker/feed.ts should have no-opped the retry",
      ).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }

    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM feed_items WHERE source = 'greenhouse' AND external_id = 'retry-1'",
    ).all<{ n: number }>();
    expect(
      results[0].n,
      "a retried feed pull left more than one row for the same listing",
    ).toBe(1);
  });
});
