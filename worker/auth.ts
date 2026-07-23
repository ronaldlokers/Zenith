import { betterAuth } from "better-auth";
import { admin, twoFactor } from "better-auth/plugins";

function buildAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
    },
    // TOTP-based 2FA (#211) — an authenticator-app second factor on top
    // of the existing invite-only email/password login. Passkey/WebAuthn
    // support needs a separate plugin package and browser-level testing
    // this pass didn't cover; tracked as a follow-up rather than bundled
    // in half-tested here.
    plugins: [admin(), twoFactor()],
    // Account creation is invite-only: the public sign-up route is blocked
    // in worker/index.ts before it reaches this handler. New accounts are
    // created by an existing admin via the admin plugin's create-user API.
    //
    // Rate limiting (security review, #445): Better Auth only auto-enables
    // this when NODE_ENV === "production", which the Worker never sets — so
    // without this, login and TOTP verification accepted unlimited attempts
    // (brute force). Enable it explicitly. Storage must be "database" (the
    // rateLimit table, migration 0046) because per-isolate memory can't
    // throttle across the Workers fleet. Defaults apply the strict special
    // rule of 3 attempts / 10s to the /sign-in* paths.
    rateLimit: {
      enabled: true,
      storage: "database",
    },
  });
}

// Cached per-isolate: Workers reuse the same env/DB across requests, so we
// don't want to rebuild the auth instance (and its internal D1 dialect) on
// every call.
let cached: ReturnType<typeof buildAuth> | undefined;

export function getAuth(env: Env) {
  if (!cached) cached = buildAuth(env);
  return cached;
}

export type Auth = ReturnType<typeof getAuth>;
