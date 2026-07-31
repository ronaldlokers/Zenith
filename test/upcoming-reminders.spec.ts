import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateNotifications } from "../worker/notifications";

const USER = "seed-admin";

async function allTypes(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT type FROM notifications ORDER BY type",
  ).all<{ type: string }>();
  return results.map((r) => r.type);
}

async function countOf(type: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE type = ?",
  )
    .bind(type)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// 2026-08-05T03:00:00Z is the evening of the 4th in Los Angeles and the morning
// of the 5th in Amsterdam — one instant that exercises the zone handling in
// both directions, reused from the #518 suite.
const INSTANT = new Date("2026-08-05T03:00:00Z");

describe("upcoming follow-up reminders", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
    await env.DB.prepare("DELETE FROM applications WHERE user_id = ?").bind(USER).run();
    await env.DB.prepare("DELETE FROM contacts WHERE user_id = ?").bind(USER).run();
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("Europe/Amsterdam", USER)
      .run();
    vi.useFakeTimers();
    vi.setSystemTime(INSTANT);
  });

  async function seedApp(nextActionAt: string, status = "applied") {
    const { meta } = await env.DB.prepare(
      "INSERT INTO applications (user_id, title, status, next_action_at) VALUES (?, ?, ?, ?)",
    )
      .bind(USER, "DevOps Engineer", status, nextActionAt)
      .run();
    return meta.last_row_id as number;
  }

  async function seedContact(followUpAt: string) {
    await env.DB.prepare(
      "INSERT INTO contacts (user_id, name, role, follow_up_at) VALUES (?, ?, ?, ?)",
    )
      .bind(USER, "Ada Lovelace", "Recruiter", followUpAt)
      .run();
  }

  // It is 2026-08-05 in Amsterdam, so "tomorrow" is the 6th.
  it("fires for an application due tomorrow in the user's zone", async () => {
    await seedApp("2026-08-06");
    await generateNotifications(env, 0);
    expect(await countOf("upcoming_followup")).toBe(1);
  });

  it("fires for a contact due tomorrow", async () => {
    await seedContact("2026-08-06");
    await generateNotifications(env, 0);
    expect(await countOf("upcoming_contact")).toBe(1);
  });

  it("does not fire for something due today — that is the day-of notification's job", async () => {
    await seedApp("2026-08-05");
    await generateNotifications(env, 0);
    expect(await countOf("upcoming_followup")).toBe(0);
    expect(await countOf("due_followup")).toBe(1);
  });

  it("does not fire for the day after tomorrow", async () => {
    await seedApp("2026-08-07");
    await generateNotifications(env, 0);
    expect(await countOf("upcoming_followup")).toBe(0);
  });

  it("does not fire for a dead application", async () => {
    await seedApp("2026-08-06", "rejected");
    await generateNotifications(env, 0);
    expect(await countOf("upcoming_followup")).toBe(0);
  });

  // The regression the separate dedup prefix exists to prevent. If the
  // day-before notification reused `followup:<id>:<date>`, it would claim that
  // key and ON CONFLICT DO NOTHING would swallow the day-of one — the user
  // would be told "tomorrow" and then hear nothing on the day itself. Silent
  // in production, which is why it is asserted here.
  it("does not suppress the day-of notification when the date arrives", async () => {
    await seedApp("2026-08-06");
    await generateNotifications(env, 0);
    expect(await countOf("upcoming_followup")).toBe(1);

    // Roll the clock forward a day: the 6th is now today in Amsterdam.
    vi.setSystemTime(new Date("2026-08-06T03:00:00Z"));
    await generateNotifications(env, 0);
    expect(await countOf("due_followup")).toBe(1);
    expect(await allTypes()).toContain("due_followup");
  });

  it("treats a null timezone as UTC, like every other generation query", async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = NULL WHERE id = ?')
      .bind(USER)
      .run();
    // At this instant the UTC date is also 2026-08-05, so tomorrow is the 6th.
    await seedApp("2026-08-06");
    await generateNotifications(env, 0);
    expect(await countOf("upcoming_followup")).toBe(1);
  });
});
