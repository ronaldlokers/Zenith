import type { Hono } from "hono";
import type { AppEnv } from "./index.js";

// ICS calendar export (#215) — a subscribe URL any calendar app can
// add (Google/Outlook/Apple all support "subscribe from URL"), auto-
// refreshing on whatever interval that app polls at. One-way and
// read-only by design: no OAuth app registration needed, unlike a
// real two-way sync, which this repo has no way to provision
// credentials for.

function icsEscape(text: string): string {
  // Bare \r stripped first — some calendar clients treat a lone CR as a
  // line terminator, and titles can originate from external job data (#346).
  return text
    .replace(/\r/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

function icsDate(d: string): string {
  return d.replace(/[-:]/g, "").slice(0, 8);
}

interface IcsEvent {
  uid: string;
  date: string;
  summary: string;
  description?: string;
}

function buildIcs(events: IcsEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zenith//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Zenith",
  ];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@zenith`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function registerCalendarRoutes(app: Hono<AppEnv>) {
  app.post("/api/profile/calendar-token", async (c) => {
    const token = crypto.randomUUID();
    const userId = c.get("userId");
    await c.env.DB.prepare(
      "INSERT INTO profile (user_id, calendar_token) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET calendar_token = excluded.calendar_token",
    )
      .bind(userId, token)
      .run();
    return c.json({ calendar_token: token });
  });

  app.delete("/api/profile/calendar-token", async (c) => {
    await c.env.DB.prepare("UPDATE profile SET calendar_token = NULL WHERE user_id = ?")
      .bind(c.get("userId"))
      .run();
    return c.body(null, 204);
  });

  // Outside /api entirely, same as /shared/:token — an unguessable
  // token is the auth, by design, so a calendar app's periodic fetch
  // doesn't need a login session. No .ics suffix on the path (Hono's
  // router doesn't cleanly support a param+literal-suffix pattern) —
  // Content-Type: text/calendar is what subscribing calendar apps
  // actually key off, not the URL extension.
  app.get("/calendar/:token", async (c) => {
    const token = c.req.param("token");
    const profile = await c.env.DB.prepare(
      "SELECT user_id FROM profile WHERE calendar_token = ?",
    )
      .bind(token)
      .first<{ user_id: string }>();
    if (!profile) return c.text("Not found", 404);

    const [followUps, deadlines, interviews] = await Promise.all([
      c.env.DB.prepare(
        `SELECT applications.id, applications.title, applications.next_action,
                applications.next_action_at AS date, companies.name AS company_name
         FROM applications
         LEFT JOIN companies ON companies.id = applications.company_id
         WHERE applications.user_id = ?
           AND applications.next_action_at IS NOT NULL
           AND applications.status NOT IN ('rejected', 'withdrawn', 'ghosted')`,
      )
        .bind(profile.user_id)
        .all<{ id: number; title: string; next_action: string | null; date: string; company_name: string | null }>(),
      c.env.DB.prepare(
        `SELECT applications.id, applications.title,
                applications.deadline_at AS date, companies.name AS company_name
         FROM applications
         LEFT JOIN companies ON companies.id = applications.company_id
         WHERE applications.user_id = ?
           AND applications.deadline_at IS NOT NULL
           AND applications.status NOT IN ('rejected', 'withdrawn', 'ghosted')`,
      )
        .bind(profile.user_id)
        .all<{ id: number; title: string; date: string; company_name: string | null }>(),
      c.env.DB.prepare(
        // Deliberately NOT selecting interactions.notes — raw interview notes
        // (candid, often blunt) must never reach an ICS feed that a user might
        // paste into a shared/work calendar (privacy review, #450).
        `SELECT interactions.id, interactions.happened_at AS date,
                applications.title, companies.name AS company_name
         FROM interactions
         LEFT JOIN applications ON applications.id = interactions.application_id
         LEFT JOIN companies ON companies.id = applications.company_id
         WHERE interactions.user_id = ?
           AND interactions.type = 'interview'
           AND interactions.happened_at >= date('now')`,
      )
        .bind(profile.user_id)
        .all<{ id: number; date: string; title: string | null; company_name: string | null }>(),
    ]);

    const events: IcsEvent[] = [
      ...followUps.results.map((a) => ({
        uid: `followup-${a.id}`,
        date: a.date,
        summary: `${a.next_action ?? "Follow up"}: ${a.title}`,
        description: a.company_name ?? undefined,
      })),
      ...deadlines.results.map((a) => ({
        uid: `deadline-${a.id}`,
        date: a.date,
        summary: `Deadline: ${a.title}`,
        description: a.company_name ?? undefined,
      })),
      ...interviews.results.map((i) => ({
        uid: `interview-${i.id}`,
        date: i.date,
        summary: `Interview: ${i.title ?? "Unknown"}`,
        description: i.company_name ?? undefined,
      })),
    ];

    return c.text(buildIcs(events), 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="zenith.ics"',
      // Calendar clients poll on their own schedule (often hourly); a few
      // minutes of staleness is fine for a subscribe feed and saves re-running
      // the joined queries on every poll (perf review, #446).
      "Cache-Control": "private, max-age=300",
    });
  });
}
