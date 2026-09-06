import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPasswordResetEmail } from "../worker/email/messages";

const BASE = "http://zenith.test";
const realFetch = globalThis.fetch;
const origKey = env.RESEND_API_KEY;

// Better Auth throttles auth paths to 3 requests per 10s (see
// test/rate-limit.spec.ts — that throttle is deliberate and this endpoint is
// covered by it, which is worth knowing). Every request here would otherwise
// share one budget and the later tests would 429 on the limiter rather than
// on anything they are asserting.
async function clearRateLimit() {
  await env.DB.prepare("DELETE FROM rateLimit").run();
}

// A forgotten password was a ticket to a one-person admin. emailAndPassword
// set only `enabled: true`, so no reset flow existed at all, and the only
// recovery route was an admin resetting the password by hand — which the
// locked-out person has no way to know about or ask for.
//
// The security-relevant half is that adding it must not turn the sign-in page
// into an account-existence oracle. This instance is invite-only; whether an
// address has an account here is exactly what should not be discoverable.
function stubResend() {
  const sent: unknown[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.resend.com/")) {
      sent.push(init?.body ? JSON.parse(String(init.body)) : {});
      return Promise.resolve(
        new Response(JSON.stringify({ id: "sent" }), { status: 200 }),
      );
    }
    return realFetch(input, init);
  });
  return sent;
}

const request = async (email: string) => {
  await clearRateLimit();
  return SELF.fetch(`${BASE}/api/auth/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, redirectTo: `${BASE}/` }),
  });
};

describe("asking for a password reset", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    env.RESEND_API_KEY = origKey;
  });

  it("answers the same way for an address that has no account", async () => {
    // The whole point. A different status, body or obvious timing difference
    // would let anyone test whether a person is a user of this instance.
    env.RESEND_API_KEY = "re_test";
    stubResend();
    const known = await request("ronald@lokers.email");
    const unknown = await request("nobody-at-all@example.com");

    expect(known.status).toBe(unknown.status);
    expect(await known.text()).toBe(await unknown.text());
  });

  it("only sends mail for an address that does have one", async () => {
    env.RESEND_API_KEY = "re_test";
    const sent = stubResend();
    await request("nobody-at-all@example.com");
    expect(sent, "an email went to an address with no account").toEqual([]);

    await request("ronald@lokers.email");
    expect(sent.length, "no email was sent for a real account").toBe(1);
  });

  it("does not fail the request when no email provider is configured", async () => {
    // A self-hoster without RESEND_API_KEY. The response must still be the
    // neutral one — leaking "email is not configured" only on real accounts
    // would be the oracle again, by a side door.
    env.RESEND_API_KEY = undefined;
    const res = await request("ronald@lokers.email");
    expect(res.status).toBe(200);
  });
});

describe("the reset email", () => {
  it("carries the one-time link and nothing about the account", () => {
    const url = "https://zenith.test/api/auth/reset-password/tok123?callbackURL=%2F";
    const msg = buildPasswordResetEmail("someone@example.com", "en", url);

    expect(msg.to).toBe("someone@example.com");
    expect(msg.html).toContain("tok123");
    // The text part carries it verbatim: a client that strips HTML must still
    // give the reader something to click.
    expect(msg.text).toContain(url);
    // No name, no other account detail. This message is sent to whatever
    // address was typed into a public form.
    expect(msg.html).not.toMatch(/ronald|lokers/i);
    expect(msg.text).toMatch(/expires in an hour|works once/i);
  });

  it("speaks the account's own language", () => {
    const nl = buildPasswordResetEmail("x@example.com", "nl", "https://z.test/t");
    expect(nl.subject).toMatch(/wachtwoord/i);
    const fallback = buildPasswordResetEmail("x@example.com", "de", "https://z.test/t");
    expect(fallback.subject).toMatch(/password/i);
  });
});

describe("whether this deployment can reset a password at all", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    env.RESEND_API_KEY = origKey;
  });

  it("is reachable without a session, since the sign-in page asks it", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth-capabilities`);
    expect(res.status, "the sign-in page cannot ask this before signing in").toBe(200);
    expect(await res.json()).toHaveProperty("passwordReset");
  });

  it("reports false when no provider is configured, so the link is not offered", async () => {
    // Without this a self-hoster with no RESEND_API_KEY gets a "Forgot your
    // password?" link promising an email nothing will ever send.
    env.RESEND_API_KEY = undefined;
    const res = await SELF.fetch(`${BASE}/api/auth-capabilities`);
    expect(await res.json()).toEqual({ passwordReset: false });
  });

  it("reports true once one is", async () => {
    env.RESEND_API_KEY = "re_test";
    const res = await SELF.fetch(`${BASE}/api/auth-capabilities`);
    expect(await res.json()).toEqual({ passwordReset: true });
  });
});
