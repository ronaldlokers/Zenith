import type { Hono } from "hono";
import type { AppEnv } from "./index.js";
import { sendPushToUser } from "./push.js";

// In-app notification center (#213) — generated on the existing 6h
// feed/stale-posting cron rather than a new trigger. Idempotent via
// dedup_key + ON CONFLICT DO NOTHING, so re-running the same scan
// never produces duplicate rows. Each newly-inserted row (via
// RETURNING, so only genuinely new ones, not no-op conflicts) also
// fires a push notification (#214) — best effort, silently skipped
// for users with no push subscription or no VAPID keys configured.

async function insertAndPush(
  env: Env,
  sql: string,
  bind: unknown[],
): Promise<void> {
  const { results } = await env.DB.prepare(sql)
    .bind(...bind)
    .all<{ user_id: string; title: string; body: string | null; link: string | null }>();
  await Promise.all(
    results.map((n) =>
      sendPushToUser(env, n.user_id, {
        title: n.title,
        body: n.body ?? undefined,
        url: n.link ?? "/",
      }),
    ),
  );
}

export async function generateNotifications(
  env: Env,
  feedInsertedCount: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Due/overdue follow-ups — one per application per next_action_at
  // value, so editing the date naturally produces a fresh notification
  // instead of silently staying dismissed.
  await insertAndPush(
    env,
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
     SELECT applications.user_id, 'due_followup', applications.title,
            COALESCE(applications.next_action, ''), '/jobs/' || applications.id,
            'followup:' || applications.id || ':' || applications.next_action_at
     FROM applications
     WHERE applications.next_action_at IS NOT NULL
       AND applications.next_action_at <= date('now')
       AND applications.status NOT IN ('rejected', 'withdrawn', 'ghosted')
     ON CONFLICT (user_id, dedup_key) DO NOTHING
     RETURNING user_id, title, body, link`,
    [],
  );

  // Stale postings — one-time per application, mirroring the soft
  // "may be gone" badge posting-check.ts already sets.
  await insertAndPush(
    env,
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
     SELECT applications.user_id, 'stale_posting', applications.title,
            NULL, '/jobs/' || applications.id, 'stale:' || applications.id
     FROM applications
     WHERE applications.posting_status = 'maybe_stale'
     ON CONFLICT (user_id, dedup_key) DO NOTHING
     RETURNING user_id, title, body, link`,
    [],
  );

  // Due/overdue contact follow-ups — mirrors due_followup but keyed off
  // the user-set contacts.follow_up_at. dedup_key embeds the date, so
  // rescheduling produces a fresh nudge and an unchanged date nudges once.
  await insertAndPush(
    env,
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
     SELECT contacts.user_id, 'due_contact', contacts.name,
            COALESCE(contacts.role, ''), '/people/' || contacts.id,
            'contact_followup:' || contacts.id || ':' || contacts.follow_up_at
     FROM contacts
     WHERE contacts.follow_up_at IS NOT NULL
       AND contacts.follow_up_at <= date('now')
       AND contacts.user_id IS NOT NULL
     ON CONFLICT (user_id, dedup_key) DO NOTHING
     RETURNING user_id, title, body, link`,
    [],
  );

  // New Feed matches — one aggregate notification per user per day
  // (not per item) so a 6-hourly cron with a healthy source list
  // doesn't spam the panel.
  if (feedInsertedCount > 0) {
    await insertAndPush(
      env,
      `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
       SELECT DISTINCT feed_sources.user_id, 'feed_match',
              ? || ' new listing(s) in your Feed', NULL, '/feed',
              'feed:' || ?
       FROM feed_sources
       WHERE feed_sources.enabled = 1
       ON CONFLICT (user_id, dedup_key) DO NOTHING
       RETURNING user_id, title, body, link`,
      [feedInsertedCount, today],
    );
  }
}

export function registerNotificationRoutes(app: Hono<AppEnv>) {
  app.get("/api/notifications", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM notifications WHERE user_id = ?
       ORDER BY read_at IS NOT NULL, created_at DESC LIMIT 50`,
    )
      .bind(c.get("userId"))
      .all();
    return c.json(results);
  });

  app.post("/api/notifications/:id/read", async (c) => {
    await c.env.DB.prepare(
      `UPDATE notifications SET read_at = datetime('now')
       WHERE id = ? AND user_id = ? AND read_at IS NULL`,
    )
      .bind(c.req.param("id"), c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  app.post("/api/notifications/read-all", async (c) => {
    await c.env.DB.prepare(
      `UPDATE notifications SET read_at = datetime('now')
       WHERE user_id = ? AND read_at IS NULL`,
    )
      .bind(c.get("userId"))
      .run();
    return c.body(null, 204);
  });
}
