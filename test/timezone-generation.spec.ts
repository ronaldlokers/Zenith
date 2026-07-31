import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateNotifications } from "../worker/notifications";

const USER = "seed-admin";

async function dueFollowupCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE type = 'due_followup'",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("generation uses the user's local date", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
    await env.DB.prepare("DELETE FROM applications WHERE user_id = ?").bind(USER).run();
    // 2026-08-05T03:00:00Z is the evening of the 4th in Los Angeles and the
    // morning of the 5th in Amsterdam.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T03:00:00Z"));
  });

  async function seedDueOn(date: string) {
    await env.DB.prepare(
      "INSERT INTO applications (user_id, title, status, next_action_at) VALUES (?, ?, ?, ?)",
    )
      .bind(USER, "Platform Engineer", "applied", date)
      .run();
  }

  it("does not fire for an item due tomorrow in the user's zone", async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("America/Los_Angeles", USER)
      .run();
    await seedDueOn("2026-08-05"); // still tomorrow in LA
    await generateNotifications(env, 0);
    expect(await dueFollowupCount()).toBe(0);
  });

  it("fires for the same item and instant in a zone where it is already today", async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("Europe/Amsterdam", USER)
      .run();
    await seedDueOn("2026-08-05"); // already today in Amsterdam
    await generateNotifications(env, 0);
    expect(await dueFollowupCount()).toBe(1);
  });

  it("treats a null timezone as UTC, preserving today's behaviour", async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = NULL WHERE id = ?')
      .bind(USER)
      .run();
    await seedDueOn("2026-08-05"); // 2026-08-05 in UTC at this instant
    await generateNotifications(env, 0);
    expect(await dueFollowupCount()).toBe(1);
  });
});
