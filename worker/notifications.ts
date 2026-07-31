import type { Hono } from "hono";
import type { AppEnv } from "./index.js";
import { sendPushToUser } from "./push.js";
import { localDate, localDatePlus, localHour } from "./tz.js";

// In-app notification center (#213) — generated on the existing 6h
// feed/stale-posting cron rather than a new trigger. Idempotent via
// dedup_key + ON CONFLICT DO NOTHING, so re-running the same scan
// never produces duplicate rows.

// Insert only. The push is no longer sent here: deliverDuePushes below owns
// delivery, so that one gate covers every notification type and nothing
// buzzes a phone before 08:00 in the recipient's own morning.
async function insertNotifications(
  env: Env,
  sql: string,
  bind: unknown[],
): Promise<void> {
  await env.DB.prepare(sql).bind(...bind).run();
}

export async function generateNotifications(
  env: Env,
  feedInsertedCount: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // SQLite's date('now') is UTC and knows nothing about who is asking. Group by
  // stored zone so each distinct timezone's local date is computed once, then
  // scope the due queries to that group.
  const { results: zoneRows } = await env.DB.prepare(
    'SELECT DISTINCT timezone FROM "user"',
  ).all<{ timezone: string | null }>();
  const now = new Date();

  // Due/overdue follow-ups — one per application per next_action_at
  // value, so editing the date naturally produces a fresh notification
  // instead of silently staying dismissed.
  for (const { timezone } of zoneRows) {
    const day = localDate(timezone, now); // localDate(null, …) is the UTC date
    const scope = timezone === null ? "IS NULL" : "= ?";
    const binds = timezone === null ? [day] : [day, timezone];
    await insertNotifications(
      env,
      `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
       SELECT applications.user_id, 'due_followup', applications.title,
              COALESCE(applications.next_action, ''), '/board/' || applications.id,
              'followup:' || applications.id || ':' || applications.next_action_at
       FROM applications
       WHERE applications.next_action_at IS NOT NULL
         AND applications.next_action_at <= ?
         AND applications.status NOT IN ('rejected', 'withdrawn', 'ghosted')
         AND applications.user_id IN (SELECT id FROM "user" WHERE timezone ${scope})
       ON CONFLICT (user_id, dedup_key) DO NOTHING`,
      binds,
    );
  }

  // Stale postings — one-time per application, mirroring the soft
  // "may be gone" badge posting-check.ts already sets.
  await insertNotifications(
    env,
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
     SELECT applications.user_id, 'stale_posting', applications.title,
            NULL, '/board/' || applications.id, 'stale:' || applications.id
     FROM applications
     WHERE applications.posting_status = 'maybe_stale'
     ON CONFLICT (user_id, dedup_key) DO NOTHING`,
    [],
  );

  // Due/overdue contact follow-ups — mirrors due_followup but keyed off
  // the user-set contacts.follow_up_at. dedup_key embeds the date, so
  // rescheduling produces a fresh nudge and an unchanged date nudges once.
  for (const { timezone } of zoneRows) {
    const day = localDate(timezone, now); // localDate(null, …) is the UTC date
    const scope = timezone === null ? "IS NULL" : "= ?";
    const binds = timezone === null ? [day] : [day, timezone];
    await insertNotifications(
      env,
      `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
       SELECT contacts.user_id, 'due_contact', contacts.name,
              COALESCE(contacts.role, ''), '/people/' || contacts.id,
              'contact_followup:' || contacts.id || ':' || contacts.follow_up_at
       FROM contacts
       WHERE contacts.follow_up_at IS NOT NULL
         AND contacts.follow_up_at <= ?
         AND contacts.user_id IS NOT NULL
         AND contacts.user_id IN (SELECT id FROM "user" WHERE timezone ${scope})
       ON CONFLICT (user_id, dedup_key) DO NOTHING`,
      binds,
    );
  }

  // Day-before heads-up for both kinds of follow-up (#62). Same shape as the
  // due queries above, comparing `= tomorrow` instead of `<= today`.
  //
  // The dedup_key prefix is deliberately NOT the due queries' `followup:` /
  // `contact_followup:`. Reusing those would let this notification claim the
  // key a day early, and the day-of notification would then be swallowed by
  // ON CONFLICT DO NOTHING — the user would be told "tomorrow" and hear
  // nothing on the day itself. That failure is silent in production.
  for (const { timezone } of zoneRows) {
    const tomorrow = localDatePlus(timezone, now, 1);
    const scope = timezone === null ? "IS NULL" : "= ?";
    const binds = timezone === null ? [tomorrow] : [tomorrow, timezone];
    await insertNotifications(
      env,
      `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
       SELECT applications.user_id, 'upcoming_followup', applications.title,
              COALESCE(applications.next_action, ''), '/board/' || applications.id,
              'upcoming:' || applications.id || ':' || applications.next_action_at
       FROM applications
       WHERE applications.next_action_at = ?
         AND applications.status NOT IN ('rejected', 'withdrawn', 'ghosted')
         AND applications.user_id IN (SELECT id FROM "user" WHERE timezone ${scope})
       ON CONFLICT (user_id, dedup_key) DO NOTHING`,
      binds,
    );
    await insertNotifications(
      env,
      `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
       SELECT contacts.user_id, 'upcoming_contact', contacts.name,
              COALESCE(contacts.role, ''), '/people/' || contacts.id,
              'upcoming_contact:' || contacts.id || ':' || contacts.follow_up_at
       FROM contacts
       WHERE contacts.follow_up_at = ?
         AND contacts.user_id IS NOT NULL
         AND contacts.user_id IN (SELECT id FROM "user" WHERE timezone ${scope})
       ON CONFLICT (user_id, dedup_key) DO NOTHING`,
      binds,
    );
  }

  // New Feed matches — one aggregate notification per user per day
  // (not per item) so a 6-hourly cron with a healthy source list
  // doesn't spam the panel. Deliberately the UTC `today` above, not a
  // per-user local day like the due-date queries above it: this key is a
  // run-level aggregate (one count for however many sources fed this one
  // cron invocation), not a per-user comparison against a due date, so
  // there's no per-user local day to key it by in the first place.
  if (feedInsertedCount > 0) {
    await insertNotifications(
      env,
      `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
       SELECT DISTINCT feed_sources.user_id, 'feed_match',
              ? || ' new listing(s) in your Feed', NULL, '/feed',
              'feed:' || ?
       FROM feed_sources
       WHERE feed_sources.enabled = 1
       ON CONFLICT (user_id, dedup_key) DO NOTHING`,
      [feedInsertedCount, today],
    );
  }
}

// Recording and pushing are separate. A record appears in the bell as soon as
// it is generated; the push waits until the owner has reached 08:00 in their
// own timezone, so nothing buzzes a phone at 02:00. One gate for every type,
// rather than one per generator — which also keeps the feed-match count
// coupled to the run that produced it.
const DELIVERY_HOUR = 8;
const MAX_AGE_HOURS = 24;

export async function deliverDuePushes(env: Env): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_AGE_HOURS * 3600_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const { results } = await env.DB.prepare(
    `SELECT n.id, n.user_id, n.title, n.body, n.link, u.timezone
       FROM notifications n
       JOIN "user" u ON u.id = n.user_id
      WHERE n.pushed_at IS NULL
        AND n.created_at >= ?
      ORDER BY n.id`,
  )
    .bind(cutoff)
    .all<{
      id: number;
      user_id: string;
      title: string;
      body: string | null;
      link: string | null;
      timezone: string | null;
    }>();

  const due = results.filter((n) => localHour(n.timezone, now) >= DELIVERY_HOUR);
  await Promise.all(
    due.map(async (n) => {
      await sendPushToUser(env, n.user_id, {
        title: n.title,
        body: n.body ?? undefined,
        url: n.link ?? "/",
      });
      await env.DB.prepare("UPDATE notifications SET pushed_at = datetime('now') WHERE id = ?")
        .bind(n.id)
        .run();
    }),
  );
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
