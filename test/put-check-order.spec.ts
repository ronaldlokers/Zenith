import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Pins the ordering change made to contacts PUT and applications PUT: both
// now compute and check the foreign-reference guard (findForeignRef) before
// the If-Match concurrency check, so a malformed request is rejected without
// a wasted concurrency query. Companies PUT has no company_id/contact_id of
// its own, so it never had a badRef check to reorder — it isn't part of this
// file.
const BASE = "http://zenith.test";

// A company owned by a DIFFERENT user, the same shape as
// security-idor.spec.ts: the check that matters is "belongs to someone
// else", not "doesn't exist" — those are different code paths in
// findForeignRef (both fail the ownership SELECT, but a genuinely
// foreign-owned row is the case the security review was about).
const OTHER_USER = "put-order-other-tenant";
let foreignCompanyId: number;

beforeAll(async () => {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
     VALUES (?, 'Other Tenant', 'put-order-other@zenith.test', 1, ?, ?, 'user')`,
  )
    .bind(OTHER_USER, now, now)
    .run();
  const row = await env.DB.prepare(
    `INSERT INTO companies (user_id, name) VALUES (?, 'Rival Co') RETURNING id`,
  )
    .bind(OTHER_USER)
    .first<{ id: number }>();
  foreignCompanyId = row!.id;
});

describe("PUT foreign-reference guard runs before the concurrency check", () => {
  it("contacts PUT rejects a foreign company_id with the same shape as POST", async () => {
    const created = await (
      await authedFetch(`${BASE}/api/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Order Check Contact" }),
      })
    ).json<{ id: number; updated_at: string }>();

    const res = await authedFetch(`${BASE}/api/contacts/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Order Check Contact", company_id: foreignCompanyId }),
    });
    expect(res.status, "a bad company_id must be rejected").toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error, "the error names the bad table").toContain("companies");
  });

  it("applications PUT rejects a foreign company_id with the same shape as POST", async () => {
    const created = await (
      await authedFetch(`${BASE}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Order Check App", status: "applied" }),
      })
    ).json<{ id: number; updated_at: string }>();

    const res = await authedFetch(`${BASE}/api/applications/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Order Check App",
        status: "applied",
        company_id: foreignCompanyId,
      }),
    });
    expect(res.status, "a bad company_id must be rejected").toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error, "the error names the bad table").toContain("companies");
  });

  // Reordering the checks is a deliberate choice, not a side effect: when a
  // request carries BOTH a bad foreign reference and a stale If-Match, the
  // response used to be 412 (concurrency checked first) and is now 400
  // (badRef checked first, cheapest rejection wins). Nothing in the existing
  // suite pinned the old precedence — this test exists to pin the new one on
  // purpose, so a future reorder has to change this test deliberately too.
  it("contacts PUT: a bad ref AND a stale If-Match together answer 400, not 412", async () => {
    const created = await (
      await authedFetch(`${BASE}/api/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Both Wrong Contact" }),
      })
    ).json<{ id: number; updated_at: string }>();
    // Force the row's real updated_at away from what the client holds, so
    // created.updated_at is now stale.
    await env.DB.prepare("UPDATE contacts SET updated_at = ? WHERE id = ?")
      .bind("2030-01-01 09:00:00", created.id)
      .run();

    const res = await authedFetch(`${BASE}/api/contacts/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": created.updated_at },
      body: JSON.stringify({ name: "Both Wrong Contact", company_id: foreignCompanyId }),
    });
    expect(res.status, "badRef is checked before If-Match, so it wins").toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("companies");
  });

  it("applications PUT: a bad ref AND a stale If-Match together answer 400, not 412", async () => {
    const created = await (
      await authedFetch(`${BASE}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Both Wrong App", status: "applied" }),
      })
    ).json<{ id: number; updated_at: string }>();
    await env.DB.prepare("UPDATE applications SET updated_at = ? WHERE id = ?")
      .bind("2030-01-01 09:00:00", created.id)
      .run();

    const res = await authedFetch(`${BASE}/api/applications/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": created.updated_at },
      body: JSON.stringify({
        title: "Both Wrong App",
        status: "applied",
        company_id: foreignCompanyId,
      }),
    });
    expect(res.status, "badRef is checked before If-Match, so it wins").toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("companies");
  });

  it("contacts PUT still 412s on a stale If-Match when the reference is fine", async () => {
    const created = await (
      await authedFetch(`${BASE}/api/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Stale Only Contact" }),
      })
    ).json<{ id: number; updated_at: string }>();
    await env.DB.prepare("UPDATE contacts SET updated_at = ? WHERE id = ?")
      .bind("2030-01-01 09:00:00", created.id)
      .run();

    const res = await authedFetch(`${BASE}/api/contacts/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": created.updated_at },
      body: JSON.stringify({ name: "Stale Only Contact" }),
    });
    expect(res.status).toBe(412);
  });

  it("applications PUT still 412s on a stale If-Match when the reference is fine", async () => {
    const created = await (
      await authedFetch(`${BASE}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Stale Only App", status: "applied" }),
      })
    ).json<{ id: number; updated_at: string }>();
    await env.DB.prepare("UPDATE applications SET updated_at = ? WHERE id = ?")
      .bind("2030-01-01 09:00:00", created.id)
      .run();

    const res = await authedFetch(`${BASE}/api/applications/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": created.updated_at },
      body: JSON.stringify({ title: "Stale Only App", status: "applied" }),
    });
    expect(res.status).toBe(412);
  });
});
