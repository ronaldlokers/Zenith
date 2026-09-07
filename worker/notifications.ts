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

// Claims rows for one delivery channel before anything is sent: a
// conditional per-row UPDATE that only flips (and returns) rows whose stamp
// is still NULL. A concurrent run racing this one issues the same
// conditional UPDATE against the same ids and wins nothing for whichever
// rows this run claims first — that's the whole fix for the double-send
// race, no lock or new table involved, just the stamp columns that already
// existed reused as the coordination point instead of only as a record.
//
// One prepared statement, bound once per id and issued as a single
// env.DB.batch — same shape push already used for "stamp what went out",
// just moved earlier and given a WHERE ... IS NULL guard plus RETURNING so
// the caller learns which ids it actually won.
async function claimRows(
  env: Env,
  ids: number[],
  column: "pushed_at" | "emailed_at",
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const claim = env.DB.prepare(
    `UPDATE notifications SET ${column} = datetime('now')
     WHERE id = ? AND ${column} IS NULL
     RETURNING id`,
  );
  const results = await env.DB.batch(ids.map((id) => claim.bind(id)));
  const claimed = new Set<number>();
  for (const r of results) {
    for (const row of (r.results ?? []) as { id: number }[]) claimed.add(row.id);
  }
  return claimed;
}

// Reverses a claim for rows whose send actually threw or reported failure.
// A claim that stamps before sending must not silently consume the
// notification on a failed send — this puts the stamp back to NULL so the
// row is picked up and retried on the next run, same as it would have been
// under the old select-then-send-then-stamp order.
async function releaseRows(
  env: Env,
  ids: number[],
  column: "pushed_at" | "emailed_at",
): Promise<void> {
  if (ids.length === 0) return;
  const release = env.DB.prepare(`UPDATE notifications SET ${column} = NULL WHERE id = ?`);
  await env.DB.batch(ids.map((id) => release.bind(id)));
}

// Groups one user's claimed-and-still-unemailed rows into at most two
// outbound messages — one batched reminder email and one digest email —
// never one per notification. Three due_followup rows must produce one
// email, not three, or the batching design is defeated and the user gets
// spammed.
//
// Every row passed in here was already claimed (emailed_at stamped) by
// deliverDueNotifications before this ran — a row lost to a concurrent
// claim never reaches this function at all. So the only remaining job is
// deciding whether to actually send, and reverting the claim when a send
// fails; there is no "stamp on success" step left, because the claim
// already is the stamp.
async function emailUser(env: Env, rows: DueRow[]): Promise<void> {
  const { email, locale, email_reminders, email_digest } = rows[0];

  const reminderRows = rows.filter((n) => n.type in REMINDER_KIND);
  const digestRows = rows.filter((n) => n.type === "weekly_digest");
  // Neither a reminder nor a digest — feed_match, stale_posting — and any
  // row whose owner has the relevant toggle off: none of these are ever
  // emailed, but the claim already stamped them, which is exactly "handled"
  // for a type/preference that will never send. Do not add a stamp call
  // here — reverting *that* would let a later opt-in retroactively deliver
  // up to 24h of backlog in one batch, exactly the surprise #518's
  // freshness window exists to prevent for push, arriving through a
  // different door.

  if (reminderRows.length > 0 && email_reminders) {
    const items: ReminderItem[] = reminderRows.map((n) => ({
      kind: REMINDER_KIND[n.type],
      title: n.title,
      body: n.body,
    }));
    const sent = await sendEmail(env, buildReminderEmail(email, locale ?? "en", items));
    // A failed send must release every row in the batch, not just stay
    // stamped — otherwise the next hourly run would never see them again.
    if (!sent) await releaseRows(env, reminderRows.map((n) => n.id), "emailed_at");
  }

  // weekly_digest arrives as its own separate message, never folded into the
  // reminder email — it's a different cadence and a different kind of news.
  if (digestRows.length > 0 && email_digest) {
    for (const n of digestRows) {
      const sent = await sendEmail(env, buildDigestEmail(email, n.title, n.body ?? "", locale ?? "en"));
      if (!sent) await releaseRows(env, [n.id], "emailed_at");
    }
  }
}

// Unlike generateNotifications above, this one is not covered by the
// ON CONFLICT pattern that makes a Cloudflare cron retry safe (see the
// scheduled() comment in worker/index.ts) — its side effect is a push/email
// send, not a row, so there is no unique index to make a second attempt a
// no-op. Two concurrent runs (the original invocation and a retry racing it)
// used to both select the same unsent row before either stamped it, and
// both send — a real duplicate-notification risk, not merely wasted work.
//
// The fix is to claim rows before sending rather than after (claimRows,
// above): a conditional UPDATE ... WHERE column IS NULL RETURNING id that
// only the first of two racing, identical UPDATEs can win a given row for.
// The losing run's UPDATE matches nothing (the column is no longer NULL)
// and it sends nothing for that id. No lock, no new table — the same
// pushed_at/emailed_at columns the retry logic already depended on are now
// also the coordination point. Push and email each claim and release their
// own column independently, so a row can still be legitimately owed a push
// but not yet an email (or the reverse) exactly as before.
export async function deliverDueNotifications(env: Env): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_AGE_HOURS * 3600_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  // A row is outstanding when EITHER channel is unsent — a failed batch email
  // must not need a fresh push to earn a retry, and vice versa. Each claim
  // below is made independently so one channel's failure never blocks the
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

  // 1. Claim every row not yet pushed, then push only what this run won.
  //
  // A failure still yields a retry rather than rejecting the whole batch —
  // the old shape awaited Promise.all over promises that both sent and
  // wrote, so a single push that threw rejected everything and this
  // function gave up before reaching the email leg below. Here a failed
  // send releases just that id's claim (pushed_at back to NULL) so it is
  // retried next run, without touching the ids that succeeded.
  const pushCandidates = due.filter((n) => n.pushed_at === null);
  const claimedPush = await claimRows(
    env,
    pushCandidates.map((n) => n.id),
    "pushed_at",
  );
  const pushFailed = await Promise.all(
    pushCandidates
      .filter((n) => claimedPush.has(n.id))
      .map(async (n) => {
        try {
          await sendPushToUser(env, n.user_id, {
            title: n.title,
            body: n.body ?? undefined,
            url: n.link ?? "/",
          });
          return null;
        } catch (e) {
          console.error("push failed", n.id, e);
          return n.id;
        }
      }),
  );
  await releaseRows(
    env,
    pushFailed.filter((id): id is number => id !== null),
    "pushed_at",
  );

  // 2. Claim every row not yet emailed, then group only what this run won
  // by user so a batch of reminders becomes one message.
  const emailCandidates = due.filter((n) => n.emailed_at === null);
  const claimedEmail = await claimRows(
    env,
    emailCandidates.map((n) => n.id),
    "emailed_at",
  );
  const byUser = new Map<string, DueRow[]>();
  for (const n of emailCandidates) {
    if (!claimedEmail.has(n.id)) continue;
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
