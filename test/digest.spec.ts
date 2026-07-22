import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { generateWeeklyDigest } from "../worker/digest";

const USER = "seed-admin";

// created_at is set via datetime('now', ?) so it matches the DB's timestamp
// format (a bound ISO string wouldn't compare correctly against datetime()).
async function seedApp(
  status: string,
  createdOffset: string,
): Promise<number> {
  const { meta } = await env.DB.prepare(
    `INSERT INTO applications (user_id, title, status, created_at)
     VALUES (?, 'Job', ?, datetime('now', ?))`,
  )
    .bind(USER, status, createdOffset)
    .run();
  return meta.last_row_id as number;
}

async function seedMove(
  appId: number,
  from: string,
  to: string,
  changedOffset: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO status_history (application_id, user_id, from_status, to_status, changed_at)
     VALUES (?, ?, ?, ?, datetime('now', ?))`,
  )
    .bind(appId, USER, from, to, changedOffset)
    .run();
}

async function digestRows() {
  const { results } = await env.DB.prepare(
    "SELECT title, body, link FROM notifications WHERE type = 'weekly_digest' ORDER BY id",
  ).all<{ title: string; body: string; link: string }>();
  return results;
}

describe("weekly digest", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM notifications"),
      env.DB.prepare("DELETE FROM status_history WHERE user_id = ?").bind(USER),
      env.DB.prepare("DELETE FROM interactions WHERE user_id = ?").bind(USER),
      env.DB.prepare("DELETE FROM applications WHERE user_id = ?").bind(USER),
      env.DB.prepare('UPDATE "user" SET locale = NULL WHERE id = ?').bind(USER),
    ]);
  });

  it("counts a newly added application", async () => {
    await seedApp("applied", "-1 days");
    await generateWeeklyDigest(env);
    const rows = await digestRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Your week on Zenith");
    expect(rows[0].link).toBe("/");
    expect(rows[0].body).toContain("1 added");
  });

  it("counts a forward status move as advanced", async () => {
    const id = await seedApp("interview", "-3 days");
    await seedMove(id, "applied", "interview", "-1 days");
    await generateWeeklyDigest(env);
    expect((await digestRows())[0].body).toContain("1 advanced");
  });

  it("counts a stalled application (active, quiet 14+ days)", async () => {
    await seedApp("applied", "-20 days"); // old, no history/interaction
    await generateWeeklyDigest(env);
    const rows = await digestRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("1 need a nudge");
    expect(rows[0].body).toContain("0 added");
  });

  it("skips a user with no activity", async () => {
    await generateWeeklyDigest(env);
    expect(await digestRows()).toHaveLength(0);
  });

  it("does not duplicate on re-run in the same week", async () => {
    await seedApp("applied", "-1 days");
    await generateWeeklyDigest(env);
    await generateWeeklyDigest(env);
    expect(await digestRows()).toHaveLength(1);
  });

  it("localizes to the user's stored locale", async () => {
    await env.DB.prepare('UPDATE "user" SET locale = ? WHERE id = ?')
      .bind("nl", USER)
      .run();
    await seedApp("applied", "-1 days");
    await generateWeeklyDigest(env);
    const rows = await digestRows();
    expect(rows[0].title).toBe("Jouw week op Zenith");
    expect(rows[0].body).toContain("toegevoegd");
  });
});
