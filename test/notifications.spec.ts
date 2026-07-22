import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { generateNotifications } from "../worker/notifications";

// generateNotifications is normally driven by the daily cron; here we call it
// directly (like posting-check's unit tests). Push is best-effort and silently
// skips users with no subscription/VAPID, so it no-ops in tests.
const USER = "seed-admin";

async function seedContact(
  name: string,
  followUpAt: string | null,
): Promise<number> {
  const { meta } = await env.DB.prepare(
    "INSERT INTO contacts (user_id, name, role, follow_up_at) VALUES (?, ?, ?, ?)",
  )
    .bind(USER, name, "Recruiter", followUpAt)
    .run();
  return meta.last_row_id as number;
}

async function dueContactRows() {
  const { results } = await env.DB.prepare(
    "SELECT title, body, link FROM notifications WHERE type = 'due_contact' ORDER BY id",
  ).all<{ title: string; body: string | null; link: string }>();
  return results;
}

describe("contact follow-up nudges", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
    await env.DB.prepare("DELETE FROM contacts WHERE user_id = ?").bind(USER).run();
  });

  it("nudges a due contact follow-up", async () => {
    const id = await seedContact("Ada Lovelace", "2020-01-01");
    await generateNotifications(env, 0);
    const rows = await dueContactRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      title: "Ada Lovelace",
      body: "Recruiter",
      link: `/people/${id}`,
    });
  });

  it("does not duplicate on re-run (dedup)", async () => {
    await seedContact("Ada Lovelace", "2020-01-01");
    await generateNotifications(env, 0);
    await generateNotifications(env, 0);
    expect(await dueContactRows()).toHaveLength(1);
  });

  it("re-nudges after the follow-up is rescheduled", async () => {
    const id = await seedContact("Ada Lovelace", "2020-01-01");
    await generateNotifications(env, 0);
    await env.DB.prepare("UPDATE contacts SET follow_up_at = ? WHERE id = ?")
      .bind("2019-06-01", id)
      .run();
    await generateNotifications(env, 0);
    // A fresh dedup_key (embeds the date) yields a second row.
    expect(await dueContactRows()).toHaveLength(2);
  });

  it("ignores a future follow-up", async () => {
    await seedContact("Ada Lovelace", "2999-01-01");
    await generateNotifications(env, 0);
    expect(await dueContactRows()).toHaveLength(0);
  });

  it("ignores a contact with no follow-up date", async () => {
    await seedContact("Ada Lovelace", null);
    await generateNotifications(env, 0);
    expect(await dueContactRows()).toHaveLength(0);
  });
});
