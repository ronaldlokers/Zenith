import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Cross-tenant IDOR guard (security review, #445). The DB foreign keys check
// only that a referenced company/contact EXISTS, not that it belongs to the
// caller — so a user could attach another tenant's company_id/contact_id and
// read its name back through the list joins. worker/index.ts now rejects
// foreign refs on write (findForeignRef) and scopes the GET joins by user_id.
const BASE = "http://zenith.test";

// A company owned by a DIFFERENT user, seeded straight into D1.
const OTHER_USER = "other-tenant";
let foreignCompanyId: number;

beforeAll(async () => {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
     VALUES (?, 'Other Tenant', 'other@zenith.test', 1, ?, ?, 'user')`,
  )
    .bind(OTHER_USER, now, now)
    .run();
  const row = await env.DB.prepare(
    `INSERT INTO companies (user_id, name) VALUES (?, 'Secret Competitor Inc') RETURNING id`,
  )
    .bind(OTHER_USER)
    .first<{ id: number }>();
  foreignCompanyId = row!.id;
});

describe("cross-tenant reference guard", () => {
  it("rejects an application that references another user's company", async () => {
    const res = await authedFetch(`${BASE}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Sneaky", company_id: foreignCompanyId }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toContain("companies");
  });

  it("rejects a contact that references another user's company", async () => {
    const res = await authedFetch(`${BASE}/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Mole", company_id: foreignCompanyId }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts an application referencing the caller's own company", async () => {
    const own = await authedFetch(`${BASE}/api/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Own Co" }),
    });
    const ownId = (await own.json<{ id: number }>()).id;
    const res = await authedFetch(`${BASE}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Legit", company_id: ownId }),
    });
    expect(res.status).toBe(201);
  });

  it("never leaks a foreign company name even if one is already stored", async () => {
    // Bypass the write guard to simulate a row written before the fix, then
    // confirm the read-time join scoping hides the cross-tenant name.
    const app = await authedFetch(`${BASE}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Pre-existing" }),
    });
    const appId = (await app.json<{ id: number }>()).id;
    await env.DB.prepare("UPDATE applications SET company_id = ? WHERE id = ?")
      .bind(foreignCompanyId, appId)
      .run();

    const list = await authedFetch(`${BASE}/api/applications`);
    const rows = await list.json<{ id: number; company_name: string | null }[]>();
    const leaked = rows.find((r) => r.id === appId);
    expect(leaked).toBeDefined();
    expect(leaked!.company_name).toBeNull();
  });
});
