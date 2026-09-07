import { betterAuth } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { admin, twoFactor } from "better-auth/plugins";
import { sendEmail } from "./email/index.js";
import { buildPasswordResetEmail } from "./email/messages.js";
import { recordAdminAction } from "./admin-audit.js";

function buildAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      // Invite-only governs who gets an account, not who can recover one. A
      // locked-out user's only route was an admin editing D1 or calling an
      // admin REST endpoint they could not know existed, which for a
      // one-person product is a ticket per forgotten password.
      //
      // Better Auth answers "if this email exists in our system, check your
      // email" either way and pads the timing when it does not, so this adds
      // no way to discover whether an address has an account here — which
      // matters more than usual on an invite-only instance.
      //
      // The link carries a one-time token, expires in an hour, and lands on
      // /reset-password in this app rather than on a hosted page.
      sendResetPassword: async ({ user, url }) => {
        const locale = await env.DB.prepare(
          'SELECT locale FROM "user" WHERE id = ?',
        )
          .bind(user.id)
          .first<{ locale: string | null }>()
          .catch(() => null);
        const sent = await sendEmail(
          env,
          buildPasswordResetEmail(user.email, locale?.locale ?? "en", url),
        );
        if (!sent) {
          // The user has already been told to check their inbox — Better
          // Auth's response is fixed and deliberately says the same thing
          // whether or not the account exists. Nothing will arrive, so say
          // why here rather than leaving a silent dead end.
          console.error(
            "password reset requested but no email provider is configured (RESEND_API_KEY)",
          );
        }
      },
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
    // Audit trail for /admin/impersonate-user (security review): it is a
    // Better Auth admin-plugin route, not ours, so it can't call
    // recordAdminAction itself — this global after-hook (Better Auth's only
    // seam into its own endpoints) is gated to that one path. By the time it
    // runs the impersonation session already exists (createSession happened
    // inside the endpoint), so a failed audit write here can't be turned
    // into "fail closed" the way the 2FA reset route is — it's logged
    // instead, same as recordCronRun's own catch.
    //
    // ctx.context.session is still the admin's own session at this point:
    // the endpoint builds the impersonated session as a local value and
    // returns it in the response, it never reassigns ctx.context.session.
    //
    // Gated to this one path because the card named it, NOT because it is
    // the only one worth recording. The plugin also exposes set-user-password,
    // remove-user, ban-user, set-role and update-user, all reachable by any
    // admin session and none of them recorded here — set-user-password is a
    // persistent account takeover, which is worse than impersonation, not
    // better. This hook is the seam for all of them; extending it is a path
    // map rather than new machinery. Do not read the table as a complete
    // account of what an admin did.
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/admin/impersonate-user") return;
        if (isAPIError(ctx.context.returned)) return;
        const actorId = ctx.context.session?.user.id;
        const targetId = (ctx.body as { userId?: string } | undefined)?.userId;
        if (!actorId || !targetId) return;
        try {
          await recordAdminAction(env, {
            actorId,
            targetId,
            action: "impersonate_user",
          });
        } catch (e) {
          console.error("recording an impersonation audit row failed", e);
        }
      }),
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
