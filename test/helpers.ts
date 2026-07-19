import { env, SELF } from "cloudflare:test";
import { hashPassword } from "better-auth/crypto";

// Tests run against the seed-admin user created by migration 0024. It has
// no password until we set one here — auth.api.createUser isn't reachable
// from a spec file across the isolate boundary, so this mirrors what
// scripts/seed-admin.mjs does for real deployments, just against the
// in-memory test D1.
const TEST_EMAIL = "ronald@lokers.email";
const TEST_PASSWORD = "test-password-1234!";

let sessionCookie: Promise<string> | null = null;

async function signIn(): Promise<string> {
  const hash = await hashPassword(TEST_PASSWORD);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES ('seed-admin-credential', 'seed-admin', 'credential', 'seed-admin', ?, ?, ?)`,
  )
    .bind(hash, now, now)
    .run();

  const res = await SELF.fetch("http://zenith.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`test sign-in failed: ${res.status} ${await res.text()}`);
  }
  return setCookie.split(";")[0];
}

// Same signature as SELF.fetch, but attaches the seed-admin session cookie
// every /api/* route now requires.
export async function authedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  sessionCookie ??= signIn();
  const cookie = await sessionCookie;
  const headers = new Headers(init.headers);
  headers.set("Cookie", cookie);
  return SELF.fetch(url, { ...init, headers });
}
