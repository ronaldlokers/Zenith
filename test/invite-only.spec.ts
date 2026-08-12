import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// "Invite-only, no limits — no sign-up form." Better Auth ships email
// sign-up enabled; what makes this app invite-only is a four-line stub
// registered above its catch-all handler. Delete the stub and public
// registration comes back, silently, on an app whose whole access model is
// that an admin creates the accounts.
//
// Nothing tested it. The stub is easy to lose: it looks like a placeholder,
// it sits among auth wiring nobody enjoys reading, and removing it produces
// no error anywhere — just a working sign-up endpoint.
const BASE = "http://zenith.test";

async function signUp(body: Record<string, string>) {
  return SELF.fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("invite-only", () => {
  it("refuses email sign-up", async () => {
    const res = await signUp({
      email: "stranger@example.com",
      password: "hunter2hunter2",
      name: "Stranger",
    });
    expect(res.status).toBe(403);
    expect((await res.json<{ error: string }>()).error).toContain("invite-only");
  });

  it("creates no account when it refuses", async () => {
    // A 403 that still writes a row would be worse than no check at all.
    const email = "did-it-write@example.com";
    await signUp({ email, password: "hunter2hunter2", name: "Nope" });
    const { env } = await import("cloudflare:test");
    const row = await env.DB.prepare('SELECT id FROM "user" WHERE email = ?')
      .bind(email)
      .first<{ id: string }>();
    expect(row, "the refused sign-up created a user").toBeNull();
  });

  it("leaves the rest of the auth handler reachable", async () => {
    // The stub sits in front of a catch-all. Shadowing too much would break
    // sign-in for everyone, which is the failure mode of fixing this badly.
    const res = await SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
    });
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(403);
  });
});
