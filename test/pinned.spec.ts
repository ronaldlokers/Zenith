import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Pinning (#535 shell) — the bottom bar's first slot filters the board down
// to the pinned set. Own file because pinning mutates applications other
// specs count, and vitest-pool-workers isolates storage per file.
//
// pinned_at rather than a boolean, mirroring archived_at on the same table:
// the value says when, so the set can be ordered most-recent-first without a
// second column.
const BASE = "http://zenith.test";

async function seedApp(title: string): Promise<number> {
  const r = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, status: "applied" }),
  });
  return (await r.json<{ id: number }>()).id;
}

const pin = (id: number) =>
  authedFetch(`${BASE}/api/applications/${id}/pin`, { method: "POST" });
const unpin = (id: number) =>
  authedFetch(`${BASE}/api/applications/${id}/unpin`, { method: "POST" });

describe("pinning", () => {
  it("sets and clears pinned_at, and hands the row back", async () => {
    const id = await seedApp("Pin me");

    const pinned = await pin(id);
    expect(pinned.status).toBe(200);
    const afterPin = await pinned.json<{ pinned_at: string | null }>();
    // RETURNING * means the client can replace its row without a refetch.
    expect(afterPin.pinned_at).toBeTruthy();

    const unpinned = await unpin(id);
    expect(unpinned.status).toBe(200);
    expect((await unpinned.json<{ pinned_at: string | null }>()).pinned_at).toBeNull();
  });

  it("leaves the stage alone", async () => {
    // Pinning is orthogonal to the pipeline: it is the reason Pinned gets no
    // column of its own. A pin that moved or archived anything would make the
    // bottom-bar filter a second, competing notion of where work lives.
    const id = await seedApp("Still applied");
    await pin(id);
    const row = await env.DB.prepare(
      "SELECT status, archived_at FROM applications WHERE id = ?",
    )
      .bind(id)
      .first<{ status: string; archived_at: string | null }>();
    expect(row?.status).toBe("applied");
    expect(row?.archived_at).toBeNull();
  });

  it("refuses an application belonging to someone else", async () => {
    // Every write on this table is scoped by user_id; a pin endpoint that
    // forgot would be a cross-account write that returns 200.
    const id = await seedApp("Not yours");
    // A real second user: user_id is a foreign key, so parking the row on an
    // invented id fails the constraint rather than testing the check.
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('other-user', 'Other', 'other@example.com', 0, datetime('now'), datetime('now'))`,
    ).run();
    await env.DB.prepare("UPDATE applications SET user_id = ? WHERE id = ?")
      .bind("other-user", id)
      .run();

    const res = await pin(id);
    expect(res.status).toBe(404);
    const row = await env.DB.prepare(
      "SELECT pinned_at FROM applications WHERE id = ?",
    )
      .bind(id)
      .first<{ pinned_at: string | null }>();
    expect(row?.pinned_at, "it wrote to another user's row").toBeNull();
  });

  it("is carried by the export, so a pin survives a restore", async () => {
    const id = await seedApp("Exported pinned");
    await pin(id);
    const res = await authedFetch(`${BASE}/api/export`);
    const dump = await res.json<Record<string, unknown[]>>();
    const rows = (dump.applications ?? []) as { id: number; pinned_at: string | null }[];
    const mine = rows.find((r) => r.id === id);
    expect(mine, "the export dropped the application").toBeTruthy();
    expect(mine!.pinned_at, "the export dropped its pinned state").toBeTruthy();
  });
});
