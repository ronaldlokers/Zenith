import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverDueNotifications } from "../worker/notifications";

const USER = "seed-admin";
const realFetch = globalThis.fetch;

// Stub the global fetch the resend provider uses — test and worker share the
// isolate, which is why this reaches worker code where vi.mock would not
// (see test/ai-credentials.spec.ts, test/email-provider.spec.ts for the same
// pattern). Everything not aimed at Resend passes through untouched.
function stubResend(status: number, onBody?: (body: unknown) => void) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.resend.com/")) {
      onBody?.(JSON.parse(String(init?.body ?? "{}")));
      return Promise.resolve(
        new Response(JSON.stringify(status === 200 ? { id: "abc" } : { message: "nope" }), {
          status,
        }),
      );
    }
    return realFetch(input, init);
  });
}

// `vi.useFakeTimers()` only fakes the JS-realm `Date` — it does not reach
// SQLite's `datetime('now')` inside workerd, so `created_at` is always
// seeded explicitly here rather than left to the column default (mirrors
// test/push-gate.spec.ts).
async function seedNotification(
  type: string,
  createdAt: string,
  overrides: { title?: string; body?: string | null } = {},
): Promise<number> {
  const { meta } = await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key, created_at)
     VALUES (?, ?, ?, ?, '/board/1', ?, ?)`,
  )
    .bind(
      USER,
      type,
      overrides.title ?? `${type} title`,
      overrides.body ?? "body",
      `test:${type}:${createdAt}:${Math.random()}`,
      createdAt,
    )
    .run();
  return meta.last_row_id as number;
}

async function notificationRow(
  id: number,
): Promise<{ pushed_at: string | null; emailed_at: string | null } | null> {
  return env.DB.prepare("SELECT pushed_at, emailed_at FROM notifications WHERE id = ?")
    .bind(id)
    .first<{ pushed_at: string | null; emailed_at: string | null }>();
}

describe("email delivery", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
    await env.DB.prepare(
      'UPDATE "user" SET timezone = ?, locale = ?, email_reminders = 1, email_digest = 1 WHERE id = ?',
    )
      .bind("Europe/Amsterdam", "en", USER)
      .run();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("completes and sends nothing when RESEND_API_KEY is unset", async () => {
    let calls = 0;
    stubResend(200, () => {
      calls++;
    });
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z")); // 09:00 in Amsterdam, gate open
    const id = await seedNotification("due_followup", "2026-08-05 03:30:00");

    await expect(
      deliverDueNotifications({ ...env, RESEND_API_KEY: undefined }),
    ).resolves.toBeUndefined();

    expect(calls).toBe(0);
    expect((await notificationRow(id))?.emailed_at).toBeNull();
  });

  it("batches three reminder notifications for one user into one email, not three", async () => {
    let calls = 0;
    stubResend(200, () => {
      calls++;
    });
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const ids = [
      await seedNotification("due_followup", "2026-08-05 03:30:00"),
      await seedNotification("due_followup", "2026-08-05 03:31:00"),
      await seedNotification("due_contact", "2026-08-05 03:32:00"),
    ];

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    expect(calls).toBe(1);
    for (const id of ids) {
      expect((await notificationRow(id))?.emailed_at).not.toBeNull();
    }
  });

  it("sends the weekly digest as its own separate message", async () => {
    const subjects: string[] = [];
    stubResend(200, (b) => {
      subjects.push((b as { subject: string }).subject);
    });
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const reminderId = await seedNotification("due_followup", "2026-08-05 03:30:00");
    const digestId = await seedNotification("weekly_digest", "2026-08-05 03:30:00", {
      title: "Your week on Zenith",
      body: "1 added",
    });

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    expect(subjects).toHaveLength(2);
    expect(subjects).toContain("Your week on Zenith");
    expect((await notificationRow(reminderId))?.emailed_at).not.toBeNull();
    expect((await notificationRow(digestId))?.emailed_at).not.toBeNull();
  });

  it("never emails feed_match or stale_posting, but stamps them handled", async () => {
    let calls = 0;
    stubResend(200, () => {
      calls++;
    });
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const feedId = await seedNotification("feed_match", "2026-08-05 03:30:00", { body: null });
    const staleId = await seedNotification("stale_posting", "2026-08-05 03:30:00", {
      body: null,
    });

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    expect(calls).toBe(0);
    // Stamped as handled, not left NULL — otherwise these types would be
    // re-selected on every hourly run for the rest of their 24-hour window.
    expect((await notificationRow(feedId))?.emailed_at).not.toBeNull();
    expect((await notificationRow(staleId))?.emailed_at).not.toBeNull();
  });

  it("sends nothing before the recipient's 08:00 local", async () => {
    let calls = 0;
    stubResend(200, () => {
      calls++;
    });
    // 04:00Z is 06:00 in Amsterdam — before the delivery hour.
    vi.setSystemTime(new Date("2026-08-05T04:00:00Z"));
    const id = await seedNotification("due_followup", "2026-08-05 03:30:00");

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    expect(calls).toBe(0);
    expect((await notificationRow(id))?.emailed_at).toBeNull();
  });

  it("email_reminders = 0 suppresses the reminder email while the digest still sends", async () => {
    await env.DB.prepare('UPDATE "user" SET email_reminders = 0 WHERE id = ?').bind(USER).run();
    const subjects: string[] = [];
    stubResend(200, (b) => {
      subjects.push((b as { subject: string }).subject);
    });
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const reminderId = await seedNotification("due_followup", "2026-08-05 03:30:00");
    const digestId = await seedNotification("weekly_digest", "2026-08-05 03:30:00", {
      title: "Your week on Zenith",
      body: "1 added",
    });

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    expect(subjects).toHaveLength(1);
    // Suppressed, not deferred: the reminder row is stamped handled even
    // though no email went out for it (see the dedicated round-trip test
    // below for why leaving it NULL would be wrong).
    expect((await notificationRow(reminderId))?.emailed_at).not.toBeNull();
    expect((await notificationRow(digestId))?.emailed_at).not.toBeNull();
  });

  it("email_digest = 0 suppresses the digest only", async () => {
    await env.DB.prepare('UPDATE "user" SET email_digest = 0 WHERE id = ?').bind(USER).run();
    const subjects: string[] = [];
    stubResend(200, (b) => {
      subjects.push((b as { subject: string }).subject);
    });
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const reminderId = await seedNotification("due_followup", "2026-08-05 03:30:00");
    const digestId = await seedNotification("weekly_digest", "2026-08-05 03:30:00", {
      title: "Your week on Zenith",
      body: "1 added",
    });

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    expect(subjects).toHaveLength(1);
    expect((await notificationRow(reminderId))?.emailed_at).not.toBeNull();
    // Suppressed, not deferred — same reasoning as the mirror test above.
    expect((await notificationRow(digestId))?.emailed_at).not.toBeNull();
  });

  // Pins the round-trip #518 asked us to guard: a preference toggle affects
  // what happens next, it must never reach backwards. If a suppressed row
  // were left NULL instead of stamped, flipping the toggle back on later
  // would retroactively deliver up to 24h of backlog in one batch — the
  // exact surprise #518's freshness window exists to prevent for push,
  // arriving through email instead.
  it("stamps a preference-suppressed row as handled, so turning the toggle back on does not retroactively email it", async () => {
    await env.DB.prepare('UPDATE "user" SET email_reminders = 0 WHERE id = ?').bind(USER).run();
    let calls = 0;
    stubResend(200, () => {
      calls++;
    });
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const id = await seedNotification("due_followup", "2026-08-05 03:30:00");

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    expect(calls).toBe(0);
    expect((await notificationRow(id))?.emailed_at).not.toBeNull();

    // Flip the preference back on and run again — this is the half that
    // would be invisible in production: the row must stay handled, not
    // suddenly go out because the toggle changed after the fact.
    await env.DB.prepare('UPDATE "user" SET email_reminders = 1 WHERE id = ?').bind(USER).run();
    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    expect(calls).toBe(0);
  });

  it("leaves emailed_at NULL on a provider failure while pushed_at stays set, so the next run retries the email and does not re-push", async () => {
    stubResend(500);
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const id = await seedNotification("due_followup", "2026-08-05 03:30:00");

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    const first = await notificationRow(id);
    expect(first?.pushed_at).not.toBeNull();
    expect(first?.emailed_at).toBeNull();

    // A sentinel the real clock cannot produce (see push-gate.spec.ts) —
    // surviving untouched through the next run is what proves the retry
    // does not re-push.
    await env.DB.prepare("UPDATE notifications SET pushed_at = '2020-01-01 00:00:00' WHERE id = ?")
      .bind(id)
      .run();
    stubResend(200);

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    const second = await notificationRow(id);
    expect(second?.pushed_at).toBe("2020-01-01 00:00:00");
    expect(second?.emailed_at).not.toBeNull();
  });
});
