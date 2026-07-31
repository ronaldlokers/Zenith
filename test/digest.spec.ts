import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

async function digestPushedAt() {
  const { results } = await env.DB.prepare(
    "SELECT pushed_at FROM notifications WHERE type = 'weekly_digest' ORDER BY id",
  ).all<{ pushed_at: string | null }>();
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

  // The digest must leave delivery to deliverDuePushes' 08:00-local gate
  // rather than pushing straight from here — pushing here double-sends
  // (deliverDuePushes picks the same row up on its next hourly run since
  // pushed_at is never stamped either) and ignores the recipient's local
  // hour entirely (#518 fix wave).
  //
  // Asserting pushed_at IS NULL alone doesn't catch a regression here: the
  // pre-fix code never stamped it either (only deliverDuePushes does), so
  // that column is NULL right after generateWeeklyDigest in both the buggy
  // and the fixed code — it's a symptom of the bug, not something the fix
  // changes at this call site. And vi.mock("../worker/push", …) can't catch
  // it: @cloudflare/vitest-pool-workers gives generateWeeklyDigest its own
  // module instance of push.js that a mock of the test file's own import
  // doesn't reach (see test/scheduled-dispatch.spec.ts's comment for the
  // same finding against worker/index.ts). What *is* shared is the D1
  // binding object itself — env.DB is passed by reference into digest.ts,
  // not re-imported — so spying on env.DB.prepare and giving sendPushToUser
  // real-looking VAPID keys (it no-ops before touching the DB without them)
  // turns "was push attempted" into an observable query: sendPushToUser's
  // first DB call is a SELECT against push_subscriptions.
  it("leaves delivery to the push gate instead of pushing directly", async () => {
    await seedApp("applied", "-1 days");
    const origPub = env.VAPID_PUBLIC_KEY;
    const origPriv = env.VAPID_PRIVATE_KEY;
    env.VAPID_PUBLIC_KEY = "test-probe-key";
    env.VAPID_PRIVATE_KEY = "test-probe-key";
    try {
      const prepareSpy = vi.spyOn(env.DB, "prepare");
      await generateWeeklyDigest(env);
      const queriedPushSubscriptions = prepareSpy.mock.calls.some((call) =>
        String(call[0]).includes("push_subscriptions"),
      );
      expect(queriedPushSubscriptions).toBe(false);
    } finally {
      env.VAPID_PUBLIC_KEY = origPub;
      env.VAPID_PRIVATE_KEY = origPriv;
    }
    const rows = await digestPushedAt();
    expect(rows).toHaveLength(1);
    expect(rows[0].pushed_at).toBeNull();
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
