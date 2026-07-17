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
