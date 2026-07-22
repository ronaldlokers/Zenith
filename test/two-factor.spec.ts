import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";

// End-to-end test of the 2FA sign-in flow (the path Login.tsx drives), which
// had no coverage. Runs the real better-auth handler over SELF.fetch with a
// per-client cookie jar, so it exercises the actual enable -> verify -> sign
// out -> sign in -> challenge -> verify sequence a user hits.
const BASE = "http://zenith.test";
const EMAIL = "ronald@lokers.email";
const PASSWORD = "test-password-1234!";

// A minimal cookie jar over SELF.fetch — the workers test client doesn't
// persist Set-Cookie, and the 2FA flow depends on the pending-challenge and
// session cookies carrying across requests.
function makeClient() {
  const cookies = new Map<string, string>();
  return async (path: string, body?: object) => {
    const headers = new Headers({
      "Content-Type": "application/json",
      // better-auth enforces an Origin match on sensitive mutations (2FA
      // enable/verify); without it they 403.
      Origin: BASE,
      Referer: `${BASE}/`,
    });
    if (cookies.size) {
      headers.set(
        "Cookie",
        [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      );
    }
    const res = await SELF.fetch(`${BASE}${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const sc of res.headers.getSetCookie()) {
      const pair = sc.split(";")[0];
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const val = pair.slice(eq + 1);
      if (val === "") cookies.delete(name);
      else cookies.set(name, val);
    }
    return res;
  };
}

// The enable endpoint returns a totpURI whose secret param is base32(raw
// secret); .totp() signs the RAW secret, so decode it back to match.
async function totpFrom(totpURI: string): Promise<string> {
  const b32 = new URL(totpURI).searchParams.get("secret")!;
  const raw = new TextDecoder().decode(base32.decode(b32));
  return createOTP(raw, { digits: 6, period: 30 }).totp();
}

async function twoFactorEnabled(): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT "twoFactorEnabled" AS e FROM "user" WHERE id = ?',
  )
    .bind("seed-admin")
    .first<{ e: number | null }>();
  return !!row?.e;
}

beforeAll(async () => {
  const now = new Date().toISOString();
  const hash = await hashPassword(PASSWORD);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES ('seed-admin-credential', 'seed-admin', 'credential', 'seed-admin', ?, ?, ?)`,
  )
    .bind(hash, now, now)
    .run();
});

describe("two-factor sign-in flow", () => {
  it("enables (verify-first), then signs in via TOTP and via a backup code", async () => {
    const admin = makeClient();

    // Sign in with just the password (no 2FA yet).
    let res = await admin("/api/auth/sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(res.status).toBe(200);

    // Enable: returns the setup material but does NOT activate 2FA yet
    // (default config is verify-before-enable).
    res = await admin("/api/auth/two-factor/enable", { password: PASSWORD });
    expect(res.status).toBe(200);
    const { totpURI, backupCodes } = await res.json<{
      totpURI: string;
      backupCodes: string[];
    }>();
    expect(await twoFactorEnabled()).toBe(false);

    // Activate by verifying a TOTP code — now 2FA is on.
    res = await admin("/api/auth/two-factor/verify-totp", {
      code: await totpFrom(totpURI),
    });
    expect(res.status).toBe(200);
    expect(await twoFactorEnabled()).toBe(true);

    // A fresh sign-in now returns the 2FA challenge instead of a session.
    const totpClient = makeClient();
    res = await totpClient("/api/auth/sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    const challenge = await res.json<{ twoFactorRedirect?: boolean }>();
    expect(challenge.twoFactorRedirect).toBe(true);

    // Not signed in until the second factor is provided.
    let sess = await totpClient("/api/auth/get-session");
    expect((await sess.json<{ user?: unknown } | null>())?.user ?? null).toBeNull();

    // Completing the challenge with a TOTP code establishes the session.
    res = await totpClient("/api/auth/two-factor/verify-totp", {
      code: await totpFrom(totpURI),
    });
    expect(res.status).toBe(200);
    sess = await totpClient("/api/auth/get-session");
    expect((await sess.json<{ user: { email: string } }>()).user.email).toBe(EMAIL);

    // The backup-code path also completes the challenge (separate client).
    const backupClient = makeClient();
    res = await backupClient("/api/auth/sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    expect((await res.json<{ twoFactorRedirect?: boolean }>()).twoFactorRedirect).toBe(true);
    res = await backupClient("/api/auth/two-factor/verify-backup-code", {
      code: backupCodes[0],
    });
    expect(res.status).toBe(200);
    sess = await backupClient("/api/auth/get-session");
    expect((await sess.json<{ user: { email: string } }>()).user.email).toBe(EMAIL);
  });

  it("rejects a wrong code at the challenge", async () => {
    const client = makeClient();
    await client("/api/auth/sign-in/email", { email: EMAIL, password: PASSWORD });
    const res = await client("/api/auth/two-factor/verify-totp", {
      code: "000000",
    });
    expect(res.status).not.toBe(200);
    const sess = await client("/api/auth/get-session");
    expect((await sess.json<{ user?: unknown } | null>())?.user ?? null).toBeNull();
  });
});
