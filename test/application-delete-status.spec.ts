import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// DELETE /api/applications/:id used to always answer 204, even when the
// WHERE clause (id AND user_id) matched nothing — a missing id or another
// user's row. The frontend takes 204 as "gone" and drops the row from the
// UI immediately, so a delete that did nothing still looked like it worked
// until the next reload put the row back. Now the route checks
// result.meta.changes and answers 404 with { error: "not found" } when
// nothing was actually deleted, matching the sibling routes' convention.
const BASE = "http://zenith.test";
const OTHER_USER = "delete-status-other-tenant";

beforeAll(async () => {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
     VALUES (?, 'Other Tenant', 'other-delete-status@zenith.test', 1, ?, ?, 'user')`,
  )
    .bind(OTHER_USER, now, now)
    .run();
});

async function seedApplication(title = "Platform Engineer"): Promise<number> {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, role_type: "other" }),
  });
  return ((await res.json()) as { id: number }).id;
}

describe("DELETE /api/applications/:id status codes", () => {
  it("deletes an application the caller owns, and the row is really gone", async () => {
    const appId = await seedApplication("Deletable");
    const res = await authedFetch(`${BASE}/api/applications/${appId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    const row = await env.DB.prepare("SELECT id FROM applications WHERE id = ?")
      .bind(appId)
      .first();
    expect(row).toBeNull();
  });

  it("returns 404 for an id that does not exist", async () => {
    const res = await authedFetch(`${BASE}/api/applications/999999999`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect((await res.json()) as { error: string }).toEqual({
      error: "not found",
    });
  });

  it("returns 404 for another user's application and leaves it intact", async () => {
    const row = await env.DB.prepare(
      `INSERT INTO applications (user_id, title) VALUES (?, 'Not Yours') RETURNING id`,
    )
      .bind(OTHER_USER)
      .first<{ id: number }>();
    const foreignId = row!.id;

    // Prove the fixture is real before touching it, so a 404 below can't be
    // passing because there was never a row to begin with.
    const before = await env.DB.prepare(
      "SELECT id FROM applications WHERE id = ?",
    )
      .bind(foreignId)
      .first();
    expect(before).not.toBeNull();

    const res = await authedFetch(`${BASE}/api/applications/${foreignId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);

    const after = await env.DB.prepare(
      "SELECT id FROM applications WHERE id = ?",
    )
      .bind(foreignId)
      .first();
    expect(after).not.toBeNull();
  });
});
