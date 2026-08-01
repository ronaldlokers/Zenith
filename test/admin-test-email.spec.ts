import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "./helpers";

const BASE = "http://zenith.test";
const realFetch = globalThis.fetch;

// Stub the global fetch the resend provider uses — test and worker share the
// isolate, which is why this reaches worker code where vi.mock would not
// (see test/ai-credentials.spec.ts, test/email-provider.spec.ts for the same
// pattern). Everything not aimed at Resend passes through untouched.
function stubResend(status: number, body: unknown, onBody?: (body: unknown) => void) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.resend.com/")) {
      onBody?.(JSON.parse(String(init?.body ?? "{}")));
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }
    return realFetch(input, init);
  });
}

const origKey = env.RESEND_API_KEY;

afterEach(async () => {
  vi.unstubAllGlobals();
  env.RESEND_API_KEY = origKey;
  await env.DB.prepare(
    'UPDATE "user" SET email_reminders = 1, email_digest = 1 WHERE id = ?',
  )
    .bind("seed-admin")
    .run();
});

function testEmail(type: string) {
  return authedFetch(`${BASE}/api/admin/test-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
}

describe("admin test email", () => {
  it("sends a reminder sample to the caller's own address with a [test] subject prefix", async () => {
    env.RESEND_API_KEY = "re_test";
    let seen: Record<string, unknown> = {};
    stubResend(200, { id: "abc" }, (b) => {
      seen = b as Record<string, unknown>;
    });

    const res = await testEmail("reminders");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true, provider: "resend" });
    expect(seen.to).toEqual(["ronald@lokers.email"]);
    expect(String(seen.subject)).toMatch(/^\[test\]/);
  });

  it("sends the digest sample", async () => {
    env.RESEND_API_KEY = "re_test";
    let seen: Record<string, unknown> = {};
    stubResend(200, { id: "abc" }, (b) => {
      seen = b as Record<string, unknown>;
    });

    const res = await testEmail("digest");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true, provider: "resend" });
    expect(seen.to).toEqual(["ronald@lokers.email"]);
    expect(String(seen.subject)).toMatch(/^\[test\]/);
  });

  it("rejects an unknown type", async () => {
    env.RESEND_API_KEY = "re_test";
    const res = await testEmail("bogus");
    expect(res.status).toBe(400);
  });

  // The whole point of this endpoint: a missing key must be a loud,
  // named error, not a silent 200 that looks identical to a real send.
  it("reports an error naming RESEND_API_KEY when no key is configured", async () => {
    env.RESEND_API_KEY = undefined;
    let called = false;
    stubResend(200, { id: "abc" }, () => {
      called = true;
    });

    const res = await testEmail("reminders");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("RESEND_API_KEY");
    expect(called).toBe(false);
  });

  // The other half of the point: a rejected call must come back in the
  // response body verbatim, not be swallowed the way sendEmail swallows it.
  it("surfaces a provider 401 in the response body instead of swallowing it", async () => {
    env.RESEND_API_KEY = "re_bad";
    stubResend(401, { message: "API key is invalid" });

    const res = await testEmail("reminders");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("401");
    expect(body.error).toContain("API key is invalid");
  });

  // Turning reminders/digest off must not make this endpoint lie about
  // whether the transport works — those toggles govern scheduled delivery
  // only, not this diagnostic.
  it("sends even when both email preference toggles are off", async () => {
    env.RESEND_API_KEY = "re_test";
    await env.DB.prepare(
      'UPDATE "user" SET email_reminders = 0, email_digest = 0 WHERE id = ?',
    )
      .bind("seed-admin")
      .run();
    let calls = 0;
    stubResend(200, { id: "abc" }, () => {
      calls++;
    });

    const res = await testEmail("reminders");
    expect(res.status).toBe(200);
    expect(calls).toBe(1);
  });
});
