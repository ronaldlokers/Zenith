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

  it("404s an unknown token", async () => {
    const res = await SELF.fetch(`${BASE}/calendar/not-a-real-token`);
    expect(res.status).toBe(404);
  });
});
