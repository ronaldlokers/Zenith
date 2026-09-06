import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Migration 0060 gave contacts and companies an updated_at and an If-Match
// precondition, because their PUT routes write every column from a form that
// seeded when the page opened. The three CV forms are the same shape and got
// neither: PUT /api/work-experience/:id, PUT /api/education/:id and
// PUT /api/profile rewrite every field they own with no validator, and their
// tables had no updated_at for one to anchor to.
//
// A CV tab left open since breakfast, saved after a summary was edited on a
// phone, put the old summary back. Both saves returned 200 and nothing said
// so — the same defect 0060 was written for, on the forms most likely to be
// left open, because a CV is edited slowly.
//
// The seeded updated_at is in the past for the same reason the concurrent-edit
// spec does it: updated_at is datetime('now') at second resolution, so a seed
// and the write after it land in the same second and a "stale" value still
// matches.
const BASE = "http://zenith.test";
const STALE = "2026-01-01 09:00:00";

const put = (path: string, body: unknown, ifMatch?: string) =>
  authedFetch(`${BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(ifMatch ? { "If-Match": ifMatch } : {}),
    },
    body: JSON.stringify(body),
  });

async function seedWork() {
  const res = await authedFetch(`${BASE}/api/work-experience`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company: "Northwind", title: "Engineer" }),
  });
  const row = await res.json<{ id: number }>();
  await env.DB.prepare("UPDATE work_experience SET updated_at = ? WHERE id = ?")
    .bind(STALE, row.id)
    .run();
  return row.id;
}

async function seedEducation() {
  const res = await authedFetch(`${BASE}/api/education`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ institution: "Delft" }),
  });
  const row = await res.json<{ id: number }>();
  await env.DB.prepare("UPDATE education SET updated_at = ? WHERE id = ?")
    .bind(STALE, row.id)
    .run();
  return row.id;
}

describe("a work-experience form saved from a stale copy", () => {
  it("is refused rather than reverting what changed since", async () => {
    const id = await seedWork();
    const a = await put(`/api/work-experience/${id}`, {
      company: "Northwind",
      title: "Engineer",
      description: "Led the migration",
    });
    expect(a.status).toBe(200);

    // Tab B still holds the version it loaded before A saved.
    const b = await put(
      `/api/work-experience/${id}`,
      { company: "Northwind", title: "Engineer" },
      STALE,
    );
    expect(b.status, "a stale CV save must not succeed").toBe(412);

    const row = await env.DB.prepare(
      "SELECT description FROM work_experience WHERE id = ?",
    )
      .bind(id)
      .first<{ description: string | null }>();
    expect(row?.description, "the earlier edit was reverted anyway").toBe(
      "Led the migration",
    );
  });

  it("stamps a new version on every successful save", async () => {
    // Without this the precondition is decorative: the validator would never
    // move, so the second save of a pair would always match.
    const id = await seedWork();
    await put(`/api/work-experience/${id}`, {
      company: "Northwind",
      title: "Staff Engineer",
    });
    const row = await env.DB.prepare(
      "SELECT updated_at FROM work_experience WHERE id = ?",
    )
      .bind(id)
      .first<{ updated_at: string }>();
    expect(row?.updated_at, "updated_at did not move on save").not.toBe(STALE);
  });

  it("still accepts a save with no precondition at all", async () => {
    // Additive, like the three routes that already have this. A caller that
    // sends no header behaves exactly as before rather than starting to fail.
    const id = await seedWork();
    const res = await put(`/api/work-experience/${id}`, {
      company: "Northwind",
      title: "Engineer",
    });
    expect(res.status).toBe(200);
  });

  it("tells the client what the current version is", async () => {
    const id = await seedWork();
    const res = await put(
      `/api/work-experience/${id}`,
      { company: "Northwind", title: "Engineer" },
      "2020-01-01 00:00:00",
    );
    const body = await res.json<{ current_updated_at: string }>();
    expect(body.current_updated_at).toBe(STALE);
  });
});

describe("an education form saved from a stale copy", () => {
  it("is refused, and a matching one is not", async () => {
    const id = await seedEducation();
    const stale = await put(
      `/api/education/${id}`,
      { institution: "Delft", degree: "MSc" },
      "2020-01-01 00:00:00",
    );
    expect(stale.status).toBe(412);

    const ok = await put(
      `/api/education/${id}`,
      { institution: "Delft", degree: "MSc" },
      STALE,
    );
    expect(ok.status, "a save with the current version was refused").toBe(200);
  });
});

describe("the CV profile form saved from a stale copy", () => {
  it("is refused rather than putting the old summary back", async () => {
    // The one that actually bites: the summary is the field the tailor panel
    // rewrites, and the CV tab is the page most likely to have been open a
    // while.
    await put("/api/profile", { name: "Ronald", summary: "first" });
    await env.DB.prepare("UPDATE profile SET updated_at = ? WHERE user_id = ?")
      .bind(STALE, "seed-admin")
      .run();

    const a = await put("/api/profile", { name: "Ronald", summary: "rewritten on a phone" });
    expect(a.status).toBe(200);

    const b = await put("/api/profile", { name: "Ronald", summary: "first" }, STALE);
    expect(b.status, "a stale profile save must not succeed").toBe(412);

    const row = await env.DB.prepare(
      "SELECT summary FROM profile WHERE user_id = 'seed-admin'",
    ).first<{ summary: string }>();
    expect(row?.summary, "the rewritten summary was reverted").toBe(
      "rewritten on a phone",
    );
  });

  it("is not stamped by the unrelated writes that share the profile row", async () => {
    // profile is a grab-bag: the share token, the calendar token, the folded
    // board rails and the API key all live on the same row. If those stamped
    // updated_at, folding a board column would make an open CV form stale for
    // no reason. Only the fields this form owns move the validator.
    await put("/api/profile", { name: "Ronald" });
    const before = await env.DB.prepare(
      "SELECT updated_at FROM profile WHERE user_id = 'seed-admin'",
    ).first<{ updated_at: string }>();

    await authedFetch(`${BASE}/api/profile/board-folded`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folded: ["offer"] }),
    });

    const after = await env.DB.prepare(
      "SELECT updated_at FROM profile WHERE user_id = 'seed-admin'",
    ).first<{ updated_at: string }>();
    expect(
      after?.updated_at,
      "an unrelated profile write invalidated the CV form",
    ).toBe(before?.updated_at);
  });
});
