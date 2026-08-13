import type { Hono } from "hono";
import type { AppEnv } from "./index.js";
import { buildDigestEmail, buildReminderEmail, type ReminderItem } from "./email/messages.js";
import { sendEmail } from "./email/index.js";
import { sendPushToUser } from "./push.js";
import { localDate, localDatePlus, localHour } from "./tz.js";

// In-app notification center (#213) — generated on the existing 6h
// feed/stale-posting cron rather than a new trigger. Idempotent via
// dedup_key + ON CONFLICT DO NOTHING, so re-running the same scan
// never produces duplicate rows.

// Insert only. The push/email is no longer sent here: deliverDueNotifications
// below owns delivery, so that one gate covers every notification type and
// nothing buzzes a phone (or lands an email) before 08:00 in the recipient's
// own morning.
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

// Recording and delivery are separate. A record appears in the bell as soon
// as it is generated; push and email both wait until the owner has reached
// 08:00 in their own timezone, so nothing buzzes a phone (or lands an email)
// at 02:00. One gate for every type, rather than one per generator — which
// also keeps the feed-match count coupled to the run that produced it.
//
// Not from the generators, in particular not from generateWeeklyDigest: that
// cron fires at 08:00 UTC, which is 01:00 in Los Angeles, so sending inline
// there would reintroduce exactly what #518 fixed for push. This gate already
// knows who has reached their own 08:00.
const DELIVERY_HOUR = 8;
const MAX_AGE_HOURS = 24;

// due_followup/due_contact are "due today"; upcoming_followup/upcoming_contact
// are the day-before heads-up (#62). weekly_digest and the non-emailable types
// (feed_match, stale_posting) are handled separately below.
const REMINDER_KIND: Record<string, ReminderItem["kind"]> = {
  due_followup: "due",
  due_contact: "due",
  upcoming_followup: "upcoming",
  upcoming_contact: "upcoming",
};

interface DueRow {
  id: number;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  pushed_at: string | null;
  emailed_at: string | null;
  timezone: string | null;
  email: string;
  locale: string | null;
  email_reminders: number;
  email_digest: number;
}

async function stampEmailed(env: Env, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await env.DB.batch(
    ids.map((id) =>
      env.DB.prepare("UPDATE notifications SET emailed_at = datetime('now') WHERE id = ?").bind(
        id,
      ),
    ),
  );
}

// Groups one user's still-unemailed rows into at most two outbound
// messages — one batched reminder email and one digest email — never one
// per notification. Three due_followup rows must produce one email, not
// three, or the batching design is defeated and the user gets spammed.
async function emailUser(env: Env, rows: DueRow[]): Promise<void> {
  const { email, locale, email_reminders, email_digest } = rows[0];

  const reminderRows = rows.filter((n) => n.type in REMINDER_KIND);
  const digestRows = rows.filter((n) => n.type === "weekly_digest");
  // Neither a reminder nor a digest — feed_match, stale_posting. Never
  // emailed, but still stamped below so they stop being re-selected on
  // every run for the rest of their 24-hour window.
  const unemailableRows = rows.filter(
    (n) => !(n.type in REMINDER_KIND) && n.type !== "weekly_digest",
  );

  if (reminderRows.length > 0) {
    if (email_reminders) {
      const items: ReminderItem[] = reminderRows.map((n) => ({
        kind: REMINDER_KIND[n.type],
        title: n.title,
        body: n.body,
      }));
      const sent = await sendEmail(env, buildReminderEmail(email, locale ?? "en", items));
      // Only stamp what this send actually covered, and only on success — a
      // failure must leave every row NULL so the next hourly run retries the
      // whole batch instead of silently losing it.
      if (sent) await stampEmailed(env, reminderRows.map((n) => n.id));
    } else {
      // The owner has reminder email off: "I don't want these" means this
      // notification will not be emailed, full stop — not "pending until the
      // toggle changes". Stamp now, same as the never-emailable types below,
      // so a later opt-in can't retroactively deliver up to 24h of backlog
      // in one batch — exactly the surprise #518's freshness window exists
      // to prevent for push, arriving through a different door. Do not
      // revert this to "leave NULL" — it looks harmless (can't double-send
      // or lose an email) but it isn't.
      await stampEmailed(env, reminderRows.map((n) => n.id));
    }
  }

  // weekly_digest arrives as its own separate message, never folded into the
  // reminder email — it's a different cadence and a different kind of news.
  if (digestRows.length > 0) {
    if (email_digest) {
      for (const n of digestRows) {
        const sent = await sendEmail(env, buildDigestEmail(email, n.title, n.body ?? "", locale ?? "en"));
        if (sent) await stampEmailed(env, [n.id]);
      }
    } else {
      // Same reasoning as the reminder branch above: digest off means this
      // digest is handled, not deferred.
      await stampEmailed(env, digestRows.map((n) => n.id));
    }
  }

  await stampEmailed(env, unemailableRows.map((n) => n.id));
}

export async function deliverDueNotifications(env: Env): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_AGE_HOURS * 3600_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  // A row is outstanding when EITHER channel is unsent — a failed batch email
  // must not need a fresh push to earn a retry, and vice versa. Each stamp
  // below is written independently so one channel's failure never blocks the
  // other's delivery or retry.
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.user_id, n.type, n.title, n.body, n.link, n.pushed_at, n.emailed_at,
            u.timezone, u.email, u.locale, u.email_reminders, u.email_digest
       FROM notifications n
       JOIN "user" u ON u.id = n.user_id
      WHERE (n.pushed_at IS NULL OR n.emailed_at IS NULL)
        AND n.created_at >= ?
      ORDER BY n.id`,
  )
    .bind(cutoff)
    .all<DueRow>();

  const due = results.filter((n) => localHour(n.timezone, now) >= DELIVERY_HOUR);

  // 1. Push every row not yet pushed, exactly as before.
  await Promise.all(
    due
      .filter((n) => n.pushed_at === null)
      .map(async (n) => {
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

  // 2. Email, grouped by user so a batch of reminders becomes one message.
  const unemailed = due.filter((n) => n.emailed_at === null);
  const byUser = new Map<string, DueRow[]>();
  for (const n of unemailed) {
    const list = byUser.get(n.user_id);
    if (list) list.push(n);
    else byUser.set(n.user_id, [n]);
  }
  await Promise.all(Array.from(byUser.values()).map((rows) => emailUser(env, rows)));
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
