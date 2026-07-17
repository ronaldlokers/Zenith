import type { Hono } from "hono";
import type { AppEnv } from "./index.js";

// In-app notification center (#213) — generated on the existing 6h
// feed/stale-posting cron rather than a new trigger. Idempotent via
// dedup_key + ON CONFLICT DO NOTHING, so re-running the same scan
// never produces duplicate rows.

export async function generateNotifications(
  env: Env,
  feedInsertedCount: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Due/overdue follow-ups — one per application per next_action_at
  // value, so editing the date naturally produces a fresh notification
  // instead of silently staying dismissed.
  await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
     SELECT applications.user_id, 'due_followup', applications.title,
            COALESCE(applications.next_action, ''), '/jobs/' || applications.id,
            'followup:' || applications.id || ':' || applications.next_action_at
     FROM applications
     WHERE applications.next_action_at IS NOT NULL
       AND applications.next_action_at <= date('now')
       AND applications.status NOT IN ('rejected', 'withdrawn', 'ghosted')
     ON CONFLICT (user_id, dedup_key) DO NOTHING`,
  ).run();

  // Stale postings — one-time per application, mirroring the soft
  // "may be gone" badge posting-check.ts already sets.
  await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
     SELECT applications.user_id, 'stale_posting', applications.title,
            NULL, '/jobs/' || applications.id, 'stale:' || applications.id
     FROM applications
     WHERE applications.posting_status = 'maybe_stale'
     ON CONFLICT (user_id, dedup_key) DO NOTHING`,
  ).run();

  // New Feed matches — one aggregate notification per user per day
  // (not per item) so a 6-hourly cron with a healthy source list
  // doesn't spam the panel.
  if (feedInsertedCount > 0) {
    await env.DB.prepare(
      `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
       SELECT DISTINCT feed_sources.user_id, 'feed_match',
              ? || ' new listing(s) in your Feed', NULL, '/feed',
              'feed:' || ?
       FROM feed_sources
       WHERE feed_sources.enabled = 1
       ON CONFLICT (user_id, dedup_key) DO NOTHING`,
    )
      .bind(feedInsertedCount, today)
      .run();
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
