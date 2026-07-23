import { sendPushToUser } from "./push.js";

// Weekly accountability digest (proactive recap of the past week + a nudge on
// stalled applications). Runs on a weekly cron; one notification per user per
// week, idempotent via dedup_key.
//
// The text is worker-generated prose, so — unlike notifications that reuse raw
// DB content as their title — it must be localized here. The worker has no
// react-i18next; it localizes from this small en/nl map keyed by the user's
// persisted locale ("user".locale, set via PUT /api/preferences/locale). The
// strings live here rather than in src/locales because tsconfig.worker.json
// excludes src and the worker already emits notification prose; en/nl parity is
// kept by holding both keys in sync in this map.
const STRINGS = {
  en: {
    title: "Your week on Zenith",
    body: "{{added}} added · {{advanced}} advanced · {{stalled}} need a nudge",
  },
  nl: {
    title: "Jouw week op Zenith",
    body: "{{added}} toegevoegd · {{advanced}} vooruit · {{stalled}} hebben aandacht nodig",
  },
} as const;

type Locale = keyof typeof STRINGS;

function fill(tpl: string, vars: Record<string, number>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ""));
}

// Stage ladder rank for "advanced" = a forward move. Terminal statuses
// (rejected/withdrawn/ghosted) and unknowns rank 0, so moving *to* them never
// counts as advancing.
const STAGE_RANK =
  "CASE %col WHEN 'interested' THEN 1 WHEN 'applied' THEN 2 WHEN 'screening' THEN 3 WHEN 'interview' THEN 4 WHEN 'offer' THEN 5 ELSE 0 END";

interface DigestRow {
  user_id: string;
  locale: string | null;
  added: number;
  advanced: number;
  stalled: number;
}

export async function generateWeeklyDigest(env: Env): Promise<void> {
  const rankTo = STAGE_RANK.replace("%col", "sh.to_status");
  const rankFrom = STAGE_RANK.replace("%col", "sh.from_status");
  // Stamped once per run; the cron fires weekly (Monday), so this is the
  // week's Monday date and dedup_key yields one digest per user per week.
  const weekKey = new Date().toISOString().slice(0, 10);

  const { results } = await env.DB.prepare(
    `SELECT u.id AS user_id, u.locale AS locale,
       (SELECT COUNT(*) FROM applications a
          WHERE a.user_id = u.id
            AND a.created_at >= datetime('now', '-7 days')) AS added,
       (SELECT COUNT(DISTINCT sh.application_id) FROM status_history sh
          WHERE sh.user_id = u.id
            AND sh.changed_at >= datetime('now', '-7 days')
            AND (${rankTo}) > (${rankFrom})) AS advanced,
       (SELECT COUNT(*) FROM applications a
          WHERE a.user_id = u.id
            AND a.status IN ('applied', 'screening', 'interview')
            AND a.created_at <= datetime('now', '-14 days')
            AND NOT EXISTS (SELECT 1 FROM status_history sh
                 WHERE sh.application_id = a.id
                   AND sh.changed_at >= datetime('now', '-14 days'))
            AND NOT EXISTS (SELECT 1 FROM interactions i
                 WHERE i.application_id = a.id
                   AND i.happened_at >= date('now', '-14 days'))) AS stalled
     FROM "user" u`,
  ).all<DigestRow>();

  // No empty digest — a "0 added, 0 advanced, 0 stalled" recap is just noise.
  const active = results.filter(
    (r) => r.added + r.advanced + r.stalled > 0,
  );
  if (active.length === 0) return;

  // Batch every user's INSERT into one D1 round-trip, then fire the pushes
  // concurrently (#449) — the old per-user await-INSERT-then-await-push loop
  // serialized 2N round-trips inside one cron invocation.
  const stmts = active.map((r) => {
    const loc: Locale = r.locale === "nl" ? "nl" : "en";
    const s = STRINGS[loc];
    const body = fill(s.body, {
      added: r.added,
      advanced: r.advanced,
      stalled: r.stalled,
    });
    return env.DB.prepare(
      `INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
       VALUES (?, 'weekly_digest', ?, ?, '/', ?)
       ON CONFLICT (user_id, dedup_key) DO NOTHING
       RETURNING user_id, title, body, link`,
    ).bind(r.user_id, s.title, body, `weekly_digest:${weekKey}`);
  });
  const batch = await env.DB.batch<{
    user_id: string;
    title: string;
    body: string;
    link: string;
  }>(stmts);
  // Only genuinely-new rows (RETURNING skips no-op conflicts) fire a push.
  const inserted = batch.flatMap((b) => b.results);
  await Promise.all(
    inserted.map((n) =>
      sendPushToUser(env, n.user_id, {
        title: n.title,
        body: n.body,
        url: n.link,
      }),
    ),
  );
}
