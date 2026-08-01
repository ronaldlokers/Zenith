import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverDueNotifications } from "../worker/notifications";

const USER = "seed-admin";

async function seedNotification(createdAt: string): Promise<number> {
  const { meta } = await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key, created_at)
     VALUES (?, 'due_followup', 'Platform Engineer', 'Follow up', '/board/1', ?, ?)`,
  )
    .bind(USER, `test:${createdAt}:${Math.random()}`, createdAt)
    .run();
  return meta.last_row_id as number;
}

async function pushedAt(id: number): Promise<string | null> {
  const row = await env.DB.prepare("SELECT pushed_at FROM notifications WHERE id = ?")
    .bind(id)
    .first<{ pushed_at: string | null }>();
  return row?.pushed_at ?? null;
}

describe("push gate", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("Europe/Amsterdam", USER)
      .run();
    vi.useFakeTimers();
  });

  it("holds a record before 08:00 local", async () => {
    // 04:00Z is 06:00 in Amsterdam — before the delivery hour.
    vi.setSystemTime(new Date("2026-08-05T04:00:00Z"));
    const id = await seedNotification("2026-08-05 03:30:00");
    await deliverDueNotifications(env);
    expect(await pushedAt(id)).toBeNull();
  });

  it("releases it once 08:00 local has passed", async () => {
    // 07:00Z is 09:00 in Amsterdam.
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const id = await seedNotification("2026-08-05 03:30:00");
    await deliverDueNotifications(env);
    expect(await pushedAt(id)).not.toBeNull();
  });

  it("never re-pushes a record that was already delivered", async () => {
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z")); // 09:00 in Amsterdam, gate open
    const id = await seedNotification("2026-08-05 03:30:00");
    // A sentinel the real clock cannot produce. `pushed_at` is written with
    // SQL datetime('now'), which runs on workerd's real wall clock (not the
    // faked one) at one-second granularity — asserting that two stamps are
    // *equal* is worthless, because a call-and-recall inside one test lands
    // in the same real second either way, re-pushed or not. Asserting the
    // sentinel *survives untouched* is the only thing that actually detects
    // a re-push (e.g. the `pushed_at IS NULL` filter being dropped).
    await env.DB.prepare("UPDATE notifications SET pushed_at = '2020-01-01 00:00:00' WHERE id = ?")
      .bind(id)
      .run();
    await deliverDueNotifications(env);
    expect(await pushedAt(id)).toBe("2020-01-01 00:00:00");
  });

  // Re-enabling push after a quiet week must not blast a backlog.
  it("ignores a record older than 24 hours", async () => {
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const id = await seedNotification("2026-08-03 09:00:00");
    await deliverDueNotifications(env);
    expect(await pushedAt(id)).toBeNull();
  });

  it("uses the owner's zone, not UTC", async () => {
    // 15:00Z is 08:00 in Los Angeles but already 17:00 in Amsterdam.
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("America/Los_Angeles", USER)
      .run();
    vi.setSystemTime(new Date("2026-08-05T13:00:00Z")); // 06:00 in LA
    const id = await seedNotification("2026-08-05 12:30:00");
    await deliverDueNotifications(env);
    expect(await pushedAt(id)).toBeNull();
  });
});
