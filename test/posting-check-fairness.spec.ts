import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PER_USER_BATCH, checkStalePostings } from "../worker/posting-check";

// BATCH_SIZE was 15 with no user_id predicate: the fifteen least-recently
// checked applications across the whole deployment. The cron fires every six
// hours, so that is sixty checks a day for everyone combined — a constant
// tuned when there was one account, which turns into a division the moment
// there are two.
//
// At the stated ~50 applications per heavy user, three users already means a
// posting is re-checked about every three days, so the board's "posting may be
// gone" badge reports a state that can be days old. And the ordering made it
// worse than an even split: whoever was checked least recently took the whole
// batch, so a user who added fifty applications at once could starve everyone
// else for days.
const realFetch = globalThis.fetch;

// Every probe answers 200 at the URL it was asked for, so nothing is flagged
// and the test is only about which applications get looked at.
function stubProbes() {
  const seen: string[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://postings.test/")) {
      seen.push(url);
      return Promise.resolve(new Response("", { status: 200 }));
    }
    return realFetch(input, init);
  });
  return seen;
}

async function seedUser(id: string, count: number) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
  )
    .bind(id, id, `${id}@example.com`)
    .run();
  for (let i = 0; i < count; i++) {
    await env.DB.prepare(
      `INSERT INTO applications (user_id, title, status, url)
       VALUES (?, ?, 'applied', ?)`,
    )
      .bind(id, `${id} role ${i}`, `https://postings.test/${id}/${i}`)
      .run();
  }
}

const checkedPerUser = async (): Promise<Record<string, number>> => {
  const { results } = await env.DB.prepare(
    `SELECT user_id, COUNT(*) n FROM applications
      WHERE posting_checked_at IS NOT NULL GROUP BY user_id`,
  ).all<{ user_id: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.user_id, r.n]));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("who the stale-posting cron gets round to", () => {
  it("gives every account its own batch instead of one shared one", async () => {
    await env.DB.prepare("DELETE FROM applications").run();
    const each = PER_USER_BATCH + 5;
    await seedUser("tenant-a", each);
    await seedUser("tenant-b", each);
    stubProbes();

    const result = await checkStalePostings(env);
    const per = await checkedPerUser();

    expect(
      per["tenant-b"],
      "the second account got none of the batch — it is still shared",
    ).toBe(PER_USER_BATCH);
    expect(per["tenant-a"]).toBe(PER_USER_BATCH);
    expect(result.checked).toBe(PER_USER_BATCH * 2);
  });

  it("does not let one account's backlog starve another", async () => {
    // The shape that made the old ordering unfair rather than merely small:
    // a user who adds fifty applications at once sorts to the front of a
    // global "least recently checked" list and holds it.
    await env.DB.prepare("DELETE FROM applications").run();
    await seedUser("tenant-big", PER_USER_BATCH * 3);
    await seedUser("tenant-small", 2);
    stubProbes();

    await checkStalePostings(env);
    const per = await checkedPerUser();
    expect(
      per["tenant-small"],
      "the small account was crowded out by the large one",
    ).toBe(2);
  });

  it("still checks the least recently checked of an account's own first", async () => {
    // The per-user ordering has to survive the partition, or the batch walks
    // the same applications every run and never reaches the rest. Two rows are
    // stamped as checked moments ago; with more never-checked rows than fit in
    // one batch, neither should be looked at again this run.
    await env.DB.prepare("DELETE FROM applications").run();
    await seedUser("tenant-c", PER_USER_BATCH + 3);
    const FRESH = "2099-01-01 00:00:00";
    await env.DB.prepare(
      `UPDATE applications SET posting_checked_at = ?
        WHERE user_id = 'tenant-c' AND title IN ('tenant-c role 0', 'tenant-c role 1')`,
    )
      .bind(FRESH)
      .run();
    stubProbes();

    await checkStalePostings(env);
    const { results } = await env.DB.prepare(
      `SELECT title, posting_checked_at FROM applications
        WHERE user_id = 'tenant-c' AND title IN ('tenant-c role 0', 'tenant-c role 1')`,
    ).all<{ title: string; posting_checked_at: string }>();

    expect(
      results.map((r) => r.posting_checked_at),
      "a recently checked posting was re-checked while never-checked ones waited",
    ).toEqual([FRESH, FRESH]);
  });
});
