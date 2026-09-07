import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverDueNotifications } from "../worker/notifications";

// deliverDueNotifications' side effect is a push/email send, not a row, so
// (unlike every other scheduled task here) a UNIQUE index can't make a second
// attempt a no-op — see the comment above the function in
// worker/notifications.ts. This suite pins the fix: rows are claimed (stamped)
// before sending, not after, so a run that loses the claim sends nothing.
const USER = "seed-admin";
const realFetch = globalThis.fetch;
const GATE_OPEN = new Date("2026-08-05T07:00:00Z"); // 09:00 in Amsterdam

// Same stub shape as test/email-delivery.spec.ts — see that file's comment
// for why vi.mock can't reach worker code here but stubbing global fetch can.
function stubResend(status: number, onCall?: () => void) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.resend.com/")) {
      onCall?.();
      return Promise.resolve(
        new Response(JSON.stringify(status === 200 ? { id: "abc" } : { message: "nope" }), {
          status,
        }),
      );
    }
    return realFetch(input, init);
  });
}

async function seedNotification(createdAt = "2026-08-05 03:30:00"): Promise<number> {
  const { meta } = await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key, created_at)
     VALUES (?, 'due_followup', 'Platform Engineer', 'Follow up', '/board/1', ?, ?)`,
  )
    .bind(USER, `claim:${createdAt}:${Math.random()}`, createdAt)
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

describe("claiming notifications before send", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
    await env.DB.prepare(
      'UPDATE "user" SET timezone = ?, locale = ?, email_reminders = 1, email_digest = 1 WHERE id = ?',
    )
      .bind("Europe/Amsterdam", "en", USER)
      .run();
    vi.useFakeTimers();
    vi.setSystemTime(GATE_OPEN);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // The concurrency claim, honestly scoped. vitest-pool-workers gives D1 a
  // single connection (see the module's own setup), so this cannot force two
  // invocations' SQL to execute at literally the same instant — the two
  // deliverDueNotifications() calls below are started together but their D1
  // statements still execute one after another underneath.
  //
  // What this DOES prove: the second invocation's claim (the same
  // conditional `UPDATE ... WHERE emailed_at IS NULL ... RETURNING id`
  // deliverDueNotifications always issues) runs against a row the first
  // invocation already flipped, matches nothing, and sends nothing — which is
  // exactly the mechanism a genuine wall-clock race between an invocation and
  // a retry depends on to stay a single send. It does not prove the two runs
  // ever overlapped in real time.
  it("sends once even when two invocations are launched together, because the loser's claim wins no rows", async () => {
    let calls = 0;
    stubResend(200, () => {
      calls++;
    });

    const id = await seedNotification();

    await Promise.all([
      deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" }),
      deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" }),
    ]);

    expect(calls).toBe(1);
    const row = await notificationRow(id);
    expect(row?.pushed_at).not.toBeNull();
    expect(row?.emailed_at).not.toBeNull();
  });

  it("still delivers normally when only one run happens", async () => {
    let calls = 0;
    stubResend(200, () => {
      calls++;
    });
    const id = await seedNotification();

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    expect(calls).toBe(1);
    const row = await notificationRow(id);
    expect(row?.pushed_at).not.toBeNull();
    expect(row?.emailed_at).not.toBeNull();
  });

  it("keeps push and email independently stamped when email fails but push succeeds", async () => {
    stubResend(500);
    const id = await seedNotification();

    await deliverDueNotifications({ ...env, RESEND_API_KEY: "re_test" });

    const row = await notificationRow(id);
    expect(row?.pushed_at).not.toBeNull();
    expect(row?.emailed_at).toBeNull();
  });

  it("keeps push and email independently stamped when push fails but email succeeds", async () => {
    stubResend(200);
    const id = await seedNotification();

    // sendPushToUser only touches the DB (and can therefore only throw) once
    // VAPID keys are configured (see test/digest.spec.ts's comment on the
    // same no-op-without-keys behaviour) and a subscription row exists to
    // query for. Both are supplied here so the push leg actually reaches (and
    // fails) its D1 query, instead of no-op'ing before ever touching send.
    await env.DB.prepare(
      "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)",
    )
      .bind(USER, "https://fcm.googleapis.com/x", "p256dh", "auth")
      .run();

    const brokenEnv = {
      ...env,
      RESEND_API_KEY: "re_test",
      VAPID_PUBLIC_KEY: "test-probe-key",
      VAPID_PRIVATE_KEY: "test-probe-key",
      DB: {
        ...env.DB,
        batch: env.DB.batch.bind(env.DB),
        prepare: (sql: string) => {
          if (sql.includes("FROM push_subscriptions")) {
            throw new Error("D1 is down");
          }
          return env.DB.prepare(sql);
        },
      },
    } as unknown as Env;

    await deliverDueNotifications(brokenEnv);

    const row = await notificationRow(id);
    // Push failed (its claim was released), so it stays NULL and is retried
    // next run — not silently consumed by the claim that made the race safe.
    expect(row?.pushed_at).toBeNull();
    expect(row?.emailed_at).not.toBeNull();
  });
});
