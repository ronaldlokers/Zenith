import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { triggerWebhooks } from "../worker/public-api";

// failure_count is read into memory with the row, then written back as
// count + 1. Two deliveries that fail concurrently both read the same
// starting value and both write the same result, so N concurrent failures
// count as one — and the auto-disable that protects a dead receiver from
// being hammered forever is computed from that same stale number.
//
// The events that trigger webhooks are exactly the ones that arrive in
// bursts: a batch status push, several follow-ups marked at once.
describe("webhook failure counting", () => {
  it("counts every failed delivery, not just the last writer", async () => {
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('hook-user', 'Hook', 'hook@example.com', 0, datetime('now'), datetime('now'))`,
    ).run();
    // A host the SSRF guard allows but that cannot resolve — .invalid is
    // reserved by RFC 2606 exactly for this. A loopback address would be
    // rejected by isForbiddenUrl and skipped without any attempt, which is
    // a different code path (and its own finding).
    await env.DB.prepare(
      `INSERT INTO webhooks (user_id, url, secret, enabled, failure_count)
       VALUES ('hook-user', 'https://receiver.invalid/hook', 'secret', 1, 0)`,
    ).run();

    // Five bursts, concurrent — the shape a batch operation produces.
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        triggerWebhooks(env as never, "hook-user", "test.event", { i }),
      ),
    );

    const row = await env.DB.prepare(
      "SELECT failure_count, enabled FROM webhooks WHERE user_id = 'hook-user'",
    ).first<{ failure_count: number; enabled: number }>();
    expect(
      row?.failure_count,
      "concurrent failures collapsed into one increment",
    ).toBe(5);
  });

  it("auto-disables on the real count, not the stale one", async () => {
    // The protection this counter exists for. With the lost update it took
    // far more than WEBHOOK_DISABLE_AFTER real failures to trip, because
    // each burst advanced the count by one.
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('burst-user', 'Burst', 'burst@example.com', 0, datetime('now'), datetime('now'))`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO webhooks (user_id, url, secret, enabled, failure_count)
       VALUES ('burst-user', 'https://receiver.invalid/hook', 'secret', 1, 8)`,
    ).run();

    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        triggerWebhooks(env as never, "burst-user", "test.event", { i }),
      ),
    );

    const row = await env.DB.prepare(
      "SELECT failure_count, enabled FROM webhooks WHERE user_id = 'burst-user'",
    ).first<{ failure_count: number; enabled: number }>();
    expect(row?.failure_count).toBe(11);
    expect(row?.enabled, "a receiver past the threshold stays enabled").toBe(0);
  });

  it("records a webhook whose host became forbidden instead of skipping it", async () => {
    // The delivery-time SSRF re-check used to `return` with no status
    // update, so the row kept whatever it last said — a webhook pointing at
    // an internal address read as healthy in Settings while delivering
    // nothing. Its own status, because this is not the receiver failing and
    // no amount of retrying will change it.
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('blocked-user', 'Blocked', 'blocked@example.com', 0, datetime('now'), datetime('now'))`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO webhooks (user_id, url, secret, enabled, last_status)
       VALUES ('blocked-user', 'https://127.0.0.1:9/hook', 'secret', 1, 'ok')`,
    ).run();

    await triggerWebhooks(env as never, "blocked-user", "test.event", {});

    const row = await env.DB.prepare(
      "SELECT last_status, last_attempt_at, enabled FROM webhooks WHERE user_id = 'blocked-user'",
    ).first<{ last_status: string; last_attempt_at: string | null; enabled: number }>();
    expect(row?.last_status, "still claiming ok while sending nothing").toBe("blocked");
    expect(row?.last_attempt_at).toBeTruthy();
    expect(row?.enabled).toBe(0);
  });
});
