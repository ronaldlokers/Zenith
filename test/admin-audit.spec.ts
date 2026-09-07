import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { adminSessionCookie, authedFetch } from "./helpers";
import { recordAdminAction } from "../worker/admin-audit";

// Audit trail for admin actions with security/privacy weight (security
// review): resetting another user's 2FA, or impersonating them via Better
// Auth's admin plugin, used to leave no trace anywhere. worker/admin-audit.ts
// adds admin_actions (migration 0064); this covers the two writers into it
// and — the part that matters most — that the new reset-2fa audit write
// didn't accidentally skip the existing /api/admin/* role gate.
const BASE = "http://zenith.test";
const TARGET_ID = "audit-target-user";
const TARGET_EMAIL = "audit-target@zenith.test";
const NONADMIN_ID = "audit-nonadmin-user";
const NONADMIN_EMAIL = "audit-nonadmin@zenith.test";
const NONADMIN_PASSWORD = "test-password-9012!";

async function lastAuditRow(action: string) {
  return env.DB.prepare(
    `SELECT actor_id, target_id, action FROM admin_actions
      WHERE action = ? ORDER BY id DESC LIMIT 1`,
  )
    .bind(action)
    .first<{ actor_id: string; target_id: string; action: string }>();
}

// A second, non-admin user — sign-up is invite-only (see
// test/invite-only.spec.ts), so this seeds the user + credential row
// directly, same as helpers.ts does for seed-admin.
async function signInAsNonAdmin(): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
     VALUES (?, 'Non Admin', ?, 1, ?, ?, 'user')`,
  )
    .bind(NONADMIN_ID, NONADMIN_EMAIL, now, now)
    .run();
  const hash = await hashPassword(NONADMIN_PASSWORD);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES ('audit-nonadmin-credential', ?, 'credential', ?, ?, ?, ?)`,
  )
    .bind(NONADMIN_ID, NONADMIN_ID, hash, now, now)
    .run();
  const res = await SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: NONADMIN_EMAIL, password: NONADMIN_PASSWORD }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`non-admin sign-in failed: ${res.status} ${await res.text()}`);
  }
  return setCookie.split(";")[0];
}

beforeAll(async () => {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO "user"
        (id, name, email, "emailVerified", "createdAt", "updatedAt", role, "twoFactorEnabled")
     VALUES (?, 'Target User', ?, 1, ?, ?, 'user', 1)`,
  )
    .bind(TARGET_ID, TARGET_EMAIL, now, now)
    .run();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO "twoFactor" (id, secret, "backupCodes", "userId")
     VALUES ('audit-target-2fa', 'SECRET', '[]', ?)`,
  )
    .bind(TARGET_ID)
    .run();
});

describe("admin action audit trail", () => {
  it("records who reset whose 2FA", async () => {
    const res = await authedFetch(
      `${BASE}/api/admin/users/${TARGET_ID}/reset-2fa`,
      { method: "POST" },
    );
    expect(res.status).toBe(204);

    const row = await lastAuditRow("reset_2fa");
    expect(row?.actor_id).toBe("seed-admin");
    expect(row?.target_id).toBe(TARGET_ID);
  });

  it("still enforces the admin-only gate on the reset-2fa route", async () => {
    const cookie = await signInAsNonAdmin();
    // Re-arm 2FA so a wrongly-permitted reset would be observable, not a
    // no-op against already-cleared state.
    await env.DB.prepare(
      `INSERT OR REPLACE INTO "twoFactor" (id, secret, "backupCodes", "userId")
       VALUES ('audit-target-2fa', 'SECRET', '[]', ?)`,
    )
      .bind(TARGET_ID)
      .run();
    await env.DB.prepare('UPDATE "user" SET "twoFactorEnabled" = 1 WHERE id = ?')
      .bind(TARGET_ID)
      .run();

    const res = await SELF.fetch(
      `${BASE}/api/admin/users/${TARGET_ID}/reset-2fa`,
      { method: "POST", headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(403);

    const tf = await env.DB.prepare(
      'SELECT id FROM "twoFactor" WHERE "userId" = ?',
    )
      .bind(TARGET_ID)
      .first();
    expect(tf, "a forbidden caller must not be able to reset 2FA").not.toBeNull();
  });

  it("records who impersonated whom", async () => {
    const cookie = await adminSessionCookie();
    // Unlike our own Hono routes, this is a Better Auth endpoint — its
    // originCheckMiddleware requires a matching Origin/Referer on any
    // request that carries a cookie (test/two-factor.spec.ts hits the same
    // requirement for 2FA enable/verify).
    const res = await SELF.fetch(`${BASE}/api/auth/admin/impersonate-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: BASE,
        Referer: `${BASE}/`,
      },
      body: JSON.stringify({ userId: TARGET_ID }),
    });
    expect(res.status).toBe(200);

    const row = await lastAuditRow("impersonate_user");
    expect(row?.actor_id).toBe("seed-admin");
    expect(row?.target_id).toBe(TARGET_ID);
  });

  // The property the reset-2fa route relies on: once recordAdminAction's
  // INSERT resolves it is committed, independent of whatever the caller
  // does afterward — so writing it before the mutation it describes means
  // the row survives that mutation failing partway through.
  it("the audit row survives a later statement in the same request throwing", async () => {
    await recordAdminAction(env, {
      actorId: "seed-admin",
      targetId: TARGET_ID,
      action: "partial_failure_probe",
    });
    await expect(
      env.DB.prepare("UPDATE no_such_table SET x = 1").run(),
    ).rejects.toThrow();

    const row = await lastAuditRow("partial_failure_probe");
    expect(row?.actor_id).toBe("seed-admin");
    expect(row?.target_id).toBe(TARGET_ID);
  });
});
