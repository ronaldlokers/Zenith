import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { pruneAuthRows } from "../worker/retention";
import { authedFetch } from "./helpers";

// An IP address is personal data. Better Auth checks expiresAt when it reads a
// session, so an expired row is harmless as a credential — but it is not
// harmless as a record, and nothing ever deleted it. Over the life of an
// account the session table becomes an IP and user-agent history with no
// reason to still exist, which is the opposite of data minimisation.
//
// rateLimit rows are the same shape of problem: a key per client per window,
// written on every attempt, read only inside a window measured in seconds.
//
// Two facts the queries depend on, both measured rather than assumed:
// expiresAt is an ISO-8601 string with a T and a Z, so a plain string
// comparison against datetime('now') would be wrong and julianday() is used
// instead; lastRequest is an integer in milliseconds, not seconds.
const BASE = "http://zenith.test";

const sessions = async () =>
  (await env.DB.prepare("SELECT COUNT(*) n FROM session").first<{ n: number }>())!.n;

async function seedSession(id: string, expiresAt: string) {
  await env.DB.prepare(
    `INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, "userId", "ipAddress", "userAgent")
     VALUES (?, ?, ?, datetime('now'), datetime('now'), 'seed-admin', '203.0.113.7', 'probe')`,
  )
    .bind(id, expiresAt, `token-${id}`)
    .run();
}

describe("expired sessions", () => {
  it("are deleted, along with the IP address on them", async () => {
    await seedSession("stale-1", "2020-01-01T00:00:00.000Z");
    const before = await sessions();
    await pruneAuthRows(env);
    expect(await sessions(), "the expired session survived the prune").toBe(before - 1);

    const left = await env.DB.prepare(
      "SELECT COUNT(*) n FROM session WHERE id = 'stale-1'",
    ).first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it("do not take a live session with them", async () => {
    // The one that would turn a retention job into a logout-everyone job.
    await authedFetch(`${BASE}/api/applications`);
    await seedSession("live-1", "2099-01-01T00:00:00.000Z");
    await pruneAuthRows(env);
    const live = await env.DB.prepare(
      "SELECT COUNT(*) n FROM session WHERE id = 'live-1'",
    ).first<{ n: number }>();
    expect(live!.n, "a session that has not expired was deleted").toBe(1);
  });

  it("are recognised through the ISO format Better Auth writes", async () => {
    // Guard on the reason julianday() is here. A string comparison would read
    // "2020-01-01T00:00:00.000Z" against "2026-09-06 09:00:00" and the T
    // sorts after the space, so every expired row would look like the future.
    await seedSession("stale-iso", "2020-01-01T00:00:00.000Z");
    await pruneAuthRows(env);
    const left = await env.DB.prepare(
      "SELECT COUNT(*) n FROM session WHERE id = 'stale-iso'",
    ).first<{ n: number }>();
    expect(left!.n, "an ISO-8601 expiry was not understood as past").toBe(0);
  });
});

describe("stale rate-limit rows", () => {
  const rows = async () =>
    (await env.DB.prepare('SELECT COUNT(*) n FROM "rateLimit"').first<{ n: number }>())!.n;

  async function seedRate(id: string, lastRequest: number) {
    await env.DB.prepare(
      'INSERT INTO "rateLimit" (id, key, count, lastRequest) VALUES (?, ?, 1, ?)',
    )
      .bind(id, `key-${id}`, lastRequest)
      .run();
  }

  it("are deleted once they are far past any window", async () => {
    await seedRate("old", Date.now() - 3 * 86400000);
    const before = await rows();
    await pruneAuthRows(env);
    expect(await rows(), "a three-day-old rate-limit row survived").toBe(before - 1);
  });

  it("leave a row still inside its window alone", async () => {
    // Deleting a live counter would hand back the attempts it was counting,
    // which turns a privacy job into a way around the throttle.
    await seedRate("fresh", Date.now() - 5000);
    await pruneAuthRows(env);
    const left = await env.DB.prepare(
      `SELECT COUNT(*) n FROM "rateLimit" WHERE id = 'fresh'`,
    ).first<{ n: number }>();
    expect(left!.n, "a live rate-limit counter was reset by the prune").toBe(1);
  });

  it("reads lastRequest as milliseconds", async () => {
    // Measured, not assumed. If it were seconds, a cutoff in milliseconds
    // would be ~1970 and this row would never be reached.
    await seedRate("units", Math.floor((Date.now() - 3 * 86400000) / 1000));
    await pruneAuthRows(env);
    const left = await env.DB.prepare(
      `SELECT COUNT(*) n FROM "rateLimit" WHERE id = 'units'`,
    ).first<{ n: number }>();
    expect(left!.n, "a seconds-valued row was left behind").toBe(0);
  });
});

describe("the prune as a scheduled task", () => {
  it("never throws, so it cannot take the nightly run down with it", async () => {
    // It rides the same invocation as the backup. Every other task there is
    // wrapped in independently(), and this one keeps its own catch as well —
    // a retention job failing must not be the thing that stops a backup.
    const broken = { DB: { prepare: () => { throw new Error("D1 is down"); } } };
    await expect(
      pruneAuthRows(broken as unknown as Env),
    ).resolves.toBeUndefined();
  });
});

