import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// The ICS calendar feed is public (token-gated, no login) and meant to be
// pasted into a personal calendar. Raw interview notes must never appear in it
// (privacy review, #450) — a shared/work calendar sync would otherwise leak
// candid notes. Titles + companies stay (that's the point of the feed).
const BASE = "http://zenith.test";
const TOKEN = "cal-privacy-token";
const SECRET = "BOMBED_THE_SYSTEM_DESIGN_secret_note";

beforeAll(async () => {
  const app = await env.DB.prepare(
    "INSERT INTO applications (user_id, title, status) VALUES ('seed-admin', 'Secret Role', 'interview') RETURNING id",
  ).first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO interactions (user_id, application_id, type, happened_at, notes)
     VALUES ('seed-admin', ?, 'interview', date('now', '+1 day'), ?)`,
  )
    .bind(app!.id, SECRET)
    .run();
  await env.DB.prepare(
    `INSERT INTO profile (user_id, calendar_token) VALUES ('seed-admin', ?)
     ON CONFLICT (user_id) DO UPDATE SET calendar_token = excluded.calendar_token`,
  )
    .bind(TOKEN)
    .run();
});

describe("calendar ICS feed", () => {
  it("includes the interview title but never the raw notes", async () => {
    const res = await SELF.fetch(`${BASE}/calendar/${TOKEN}`);
    expect(res.status).toBe(200);
    const ics = await res.text();
    expect(ics).toContain("Interview: Secret Role");
    expect(ics).not.toContain(SECRET);
  });

  it("does not book the user busy, and keeps the detail out of shared views", async () => {
    // OPAQUE is the RFC 5545 default, so without this a subscriber was
    // marked busy for the whole day on every follow-up — visible to
    // colleagues doing a free/busy lookup, which is the exact exposure the
    // app's own warning about this feed is trying to prevent.
    const ics = await (await SELF.fetch(`${BASE}/calendar/${TOKEN}`)).text();
    expect(ics).toContain("TRANSP:TRANSPARENT");
    expect(ics).toContain("CLASS:PRIVATE");
  });

  it("carries a SEQUENCE so a rescheduled follow-up moves", async () => {
    // Some clients will not move an event they have already imported unless
    // the sequence goes up, and this app has a control that pushes every
    // late follow-up to a new date at once.
    const app = await env.DB.prepare(
      `INSERT INTO applications (user_id, title, status, next_action, next_action_at, updated_at)
       VALUES ('seed-admin', 'Sequenced Role', 'applied', 'Chase', date('now', '+3 day'), '2026-08-01 10:00:00')
       RETURNING id`,
    ).first<{ id: number }>();
    const first = await (await SELF.fetch(`${BASE}/calendar/${TOKEN}`)).text();
    const seq = (line: string) =>
      Number(
        line
          .split("\r\n")
          .find((l) => l.startsWith("SEQUENCE:"))
          ?.slice("SEQUENCE:".length) ?? -1,
      );
    const blockFor = (ics: string, uid: string) =>
      ics
        .split("BEGIN:VEVENT")
        .find((b) => b.includes(`UID:${uid}@zenith`)) ?? "";
    const before = seq(blockFor(first, `followup-${app!.id}`));
    expect(before).toBeGreaterThan(0);

    await env.DB.prepare(
      "UPDATE applications SET next_action_at = date('now', '+9 day'), updated_at = '2026-08-02 10:00:00' WHERE id = ?",
    )
      .bind(app!.id)
      .run();
    const second = await (await SELF.fetch(`${BASE}/calendar/${TOKEN}`)).text();
    const after = seq(blockFor(second, `followup-${app!.id}`));
    expect(after, "a rescheduled follow-up kept its old sequence").toBeGreaterThan(
      before,
    );
  });

  it("404s an unknown token", async () => {
    const res = await SELF.fetch(`${BASE}/calendar/not-a-real-token`);
    expect(res.status).toBe(404);
  });
});
