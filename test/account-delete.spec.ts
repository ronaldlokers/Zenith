import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Own file (#285): deleting the account removes the seed-admin user other
// tests depend on. Storage is isolated per file.
const BASE = "http://zenith.test";

describe("account deletion", () => {
  it("wipes the user's data and removes the account", async () => {
    // Give the account some data first.
    await authedFetch(`${BASE}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "X", role_type: "other" }),
    });

    const res = await authedFetch(`${BASE}/api/account`, { method: "DELETE" });
    expect(res.status).toBe(204);

    const user = await env.DB.prepare(
      'SELECT id FROM "user" WHERE email = ?',
    )
      .bind("ronald@lokers.email")
      .first();
    expect(user).toBeNull();

    const apps = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM applications",
    ).first<{ n: number }>();
    expect(apps!.n).toBe(0);
  });
});
