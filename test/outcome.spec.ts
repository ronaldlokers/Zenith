import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Own file: these applications close and reopen, which would disturb the
// funnel counts other specs assert on. Storage is isolated per file.
const BASE = "http://zenith.test";

async function seedApp(): Promise<number> {
  const r = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Platform Engineer", role_type: "other" }),
  });
  return ((await r.json()) as { id: number }).id;
}

function setStatus(id: number, status: string) {
  return authedFetch(`${BASE}/api/applications/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

function setOutcome(id: number, reason: string | null, note?: string | null) {
  return authedFetch(`${BASE}/api/applications/${id}/outcome`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, note: note ?? null }),
  });
}

function historyFor(id: number) {
  return env.DB.prepare(
    `SELECT to_status, outcome_reason, outcome_note FROM status_history
     WHERE application_id = ? ORDER BY changed_at, id`,
  )
    .bind(id)
    .all<{
      to_status: string;
      outcome_reason: string | null;
      outcome_note: string | null;
    }>();
}

describe("outcome reason (#381)", () => {
  it("records the reason on the terminal transition", async () => {
    const id = await seedApp();
    await setStatus(id, "rejected");
    const res = await setOutcome(id, "after_screening", "  no JD match  ");
    expect(res.status).toBe(200);

    const { results } = await historyFor(id);
    const terminal = results.filter((r) => r.to_status === "rejected");
    expect(terminal).toHaveLength(1);
    expect(terminal[0].outcome_reason).toBe("after_screening");
    expect(terminal[0].outcome_note).toBe("no JD match");
    // The non-terminal rows stay untouched.
    expect(
      results.filter((r) => r.to_status !== "rejected").every((r) => !r.outcome_reason),
    ).toBe(true);
  });

  it("rejects a reason that doesn't belong to that status", async () => {
    const id = await seedApp();
    await setStatus(id, "ghosted");
    // A withdrawal reason on a ghosted application would poison the
    // breakdown with an outcome that cannot have happened.
    const res = await setOutcome(id, "comp_too_low");
    expect(res.status).toBe(400);
    const { results } = await historyFor(id);
    expect(results.every((r) => r.outcome_reason === null)).toBe(true);
  });

  it("accepts the same slug when it does belong to the status", async () => {
    const id = await seedApp();
    await setStatus(id, "withdrawn");
    expect((await setOutcome(id, "comp_too_low")).status).toBe(200);
  });

  it("targets the latest terminal transition, not an earlier one", async () => {
    const id = await seedApp();
    await setStatus(id, "rejected");
    await setOutcome(id, "after_screening");
    await setStatus(id, "interested");
    await setStatus(id, "rejected");
    await setOutcome(id, "after_interview");

    const { results } = await historyFor(id);
    const terminal = results.filter((r) => r.to_status === "rejected");
    expect(terminal).toHaveLength(2);
    // Both outcomes survive: the reason belongs to the transition, so
    // re-closing records a second one rather than overwriting the first.
    expect(terminal[0].outcome_reason).toBe("after_screening");
    expect(terminal[1].outcome_reason).toBe("after_interview");
  });

  it("clears both fields when the reason is null", async () => {
    const id = await seedApp();
    await setStatus(id, "rejected");
    await setOutcome(id, "no_response", "was a note");
    expect((await setOutcome(id, null)).status).toBe(200);

    const { results } = await historyFor(id);
    const terminal = results.filter((r) => r.to_status === "rejected");
    expect(terminal[0].outcome_reason).toBeNull();
    expect(terminal[0].outcome_note).toBeNull();
  });

  it("404s when the application never closed", async () => {
    const id = await seedApp();
    expect((await setOutcome(id, "no_response")).status).toBe(404);
  });

  it("404s for an application owned by someone else", async () => {
    // Seeded straight into D1: the test DB has only seed-admin, so the other
    // tenant has to exist before an application can reference it.
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
       VALUES ('other-tenant', 'Other Tenant', 'other@zenith.test', 1, ?, ?, 'user')`,
    )
      .bind(now, now)
      .run();
    await env.DB.prepare(
      `INSERT INTO applications (id, user_id, title, role_type, status)
       VALUES (99123, 'other-tenant', 'Someone else''s job', 'other', 'rejected')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO status_history (application_id, user_id, from_status, to_status)
       VALUES (99123, 'other-tenant', 'applied', 'rejected')`,
    ).run();
    expect((await setOutcome(99123, "no_response")).status).toBe(404);
  });

  it("exposes the reason on /api/stats but not on the public share page", async () => {
    const id = await seedApp();
    await setStatus(id, "rejected");
    await setOutcome(id, "role_cancelled", "req frozen");

    const stats = await (
      await authedFetch(`${BASE}/api/stats`)
    ).json<{ history: Record<string, unknown>[] }>();
    const row = stats.history.find(
      (r) => r.application_id === id && r.to_status === "rejected",
    );
    expect(row?.outcome_reason).toBe("role_cancelled");

    // The share page renders server-side from its own query, which takes
    // neither column — the note is free text about a company.
    const token = "outcome-share-token";
    await authedFetch(`${BASE}/api/profile/share-token`, { method: "POST" });
    await env.DB.prepare("UPDATE profile SET share_token = ? WHERE user_id = ?")
      .bind(token, "seed-admin")
      .run();
    const html = await (await SELF.fetch(`${BASE}/shared/${token}`)).text();
    expect(html).not.toContain("req frozen");
    expect(html).not.toContain("role_cancelled");
  });
});
