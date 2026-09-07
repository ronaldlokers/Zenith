import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshFeed } from "../worker/feed";

// The fan-out this covers: refreshFeed builds one job per distinct source
// config/ATS board, aggregated across every user's watched boards, and used
// to await every job with a single unbounded Promise.all (SRE review, #660).
// That is unbounded concurrency, not unbounded total requests — Cloudflare's
// hard cap on outbound "simultaneous connections waiting for response
// headers" is 6 per invocation, on every plan, and a fetch queued past that
// still burns its own abort timeout waiting for a turn. These specs assert
// the *observed* concurrency during a run, not just that the run completes —
// a test that only counted total fetches would pass whether or not anything
// was ever bounded.
const realFetch = globalThis.fetch;
afterEach(() => vi.unstubAllGlobals());

// Deliberately NOT imported from worker/concurrency.ts. The whole point of
// this number is to notice if the real cap drifts or the bound disappears,
// so the expectation has to be fixed here rather than reading back whatever
// the source currently claims.
const EXPECTED_CAP = 6;

async function seedOnlyGreenhouseBoards(slugs: string[]): Promise<void> {
  // A clean slate for every axis refreshFeed fans out over — otherwise the
  // migration-seeded 'adzuna' feed_sources row (unconfigured, but still one
  // more job in the queue) makes the exact scheduling order harder to reason
  // about for no reason relevant to what's being tested here.
  await env.DB.prepare("DELETE FROM feed_sources").run();
  await env.DB.prepare("DELETE FROM feed_ats_boards").run();
  const values = slugs.map((s) => `('seed-admin', 'greenhouse', '${s}')`).join(",");
  await env.DB.prepare(
    `INSERT INTO feed_ats_boards (user_id, source, slug) VALUES ${values}`,
  ).run();
}

describe("feed pull fan-out concurrency", () => {
  it("never runs more fetches at once than the platform's connection cap", async () => {
    const boardCount = EXPECTED_CAP + 3; // must exceed the cap or nothing is ever bounded
    const slugs = Array.from({ length: boardCount }, (_, i) => `cap-board-${i}`);
    await seedOnlyGreenhouseBoards(slugs);

    let active = 0;
    let maxActive = 0;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.includes("boards-api.greenhouse.io")) return realFetch(input, init);
      active++;
      maxActive = Math.max(maxActive, active);
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          active--;
          resolve(new Response(JSON.stringify({ jobs: [] }), { status: 200 }));
        }, 25);
      });
    });

    await refreshFeed(env);
    expect(
      maxActive,
      "the feed pull's fan-out is not bounded to the platform's connection cap",
    ).toBe(EXPECTED_CAP);
  });

  it("keeps the listings a working board returned even when another board in the same run fails", async () => {
    const boardCount = EXPECTED_CAP + 2; // > cap, so the failure lands mid-fan-out, not at the edge
    const slugs = Array.from({ length: boardCount }, (_, i) => `resilient-${i}`);
    const brokenSlug = slugs[Math.floor(boardCount / 2)];
    await seedOnlyGreenhouseBoards(slugs);
    await env.DB.prepare("DELETE FROM cron_runs").run();
    await env.DB.prepare("DELETE FROM feed_items WHERE board_slug LIKE 'resilient-%'").run();

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.includes("boards-api.greenhouse.io")) return realFetch(input, init);
      if (url.includes(`/boards/${brokenSlug}/`)) {
        // A rejected fetch, not a 404 response — the harder case, since it
        // never reaches fetchGreenhouse's own `if (!res.ok)` branch at all.
        return Promise.reject(new Error("simulated network failure"));
      }
      const slug = url.match(/\/boards\/([^/]+)\/jobs/)?.[1] ?? "unknown";
      return Promise.resolve(
        new Response(
          JSON.stringify({ jobs: [{ id: `${slug}-1`, title: `Engineer at ${slug}` }] }),
          { status: 200 },
        ),
      );
    });

    const result = await refreshFeed(env);
    expect(
      result.seen,
      "a board's listing was lost because another board in the batch failed",
    ).toBe(boardCount - 1);

    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM feed_items WHERE board_slug LIKE 'resilient-%'",
    ).first<{ n: number }>();
    expect(
      row!.n,
      "the succeeding boards' listings were not actually inserted",
    ).toBe(boardCount - 1);

    const brokenRun = await env.DB.prepare(
      "SELECT ok FROM cron_runs WHERE label = ? ORDER BY id DESC LIMIT 1",
    )
      .bind(`feed:greenhouse:${brokenSlug}`)
      .first<{ ok: number }>();
    expect(brokenRun?.ok, "the broken board was not recorded as failing").toBe(0);
  });
});
