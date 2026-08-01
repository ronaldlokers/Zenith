import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProvider, sendEmail } from "../worker/email";

const MSG = {
  to: "someone@example.com",
  subject: "Test",
  html: "<p>Test</p>",
  text: "Test",
};

const realFetch = globalThis.fetch;

// Stub the global fetch the worker uses — test and worker share the isolate,
// which is why this reaches worker code where vi.mock would not. Everything
// not aimed at Resend passes through untouched.
function stubResend(status: number, onBody?: (body: unknown) => void) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.resend.com/")) {
      onBody?.(JSON.parse(String(init?.body ?? "{}")));
      return Promise.resolve(
        new Response(JSON.stringify(status === 200 ? { id: "abc" } : { message: "nope" }), {
          status,
        }),
      );
    }
    return realFetch(input, init);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveProvider", () => {
  it("returns null when no API key is configured, so email is simply off", () => {
    expect(resolveProvider({ ...env, RESEND_API_KEY: undefined })).toBeNull();
  });

  it("returns the resend provider when a key is present", () => {
    expect(resolveProvider({ ...env, RESEND_API_KEY: "re_test" })?.name).toBe("resend");
  });
});

describe("sendEmail", () => {
  it("does not send, and does not throw, when no key is configured", async () => {
    let called = false;
    stubResend(200, () => {
      called = true;
    });
    await expect(sendEmail({ ...env, RESEND_API_KEY: undefined }, MSG)).resolves.toBe(false);
    expect(called).toBe(false);
  });

  it("posts the message to resend", async () => {
    let seen: Record<string, unknown> = {};
    stubResend(200, (b) => {
      seen = b as Record<string, unknown>;
    });

    await expect(sendEmail({ ...env, RESEND_API_KEY: "re_test" }, MSG)).resolves.toBe(true);

    expect(seen.to).toEqual(["someone@example.com"]);
    expect(seen.subject).toBe("Test");
    expect(seen.html).toBe("<p>Test</p>");
    expect(seen.text).toBe("Test");
    // No telemetry, ever. Nothing here may opt into open or click tracking.
    expect(Object.keys(seen)).not.toContain("tags");
  });

  it("reports failure rather than throwing when the provider rejects", async () => {
    stubResend(401);
    await expect(sendEmail({ ...env, RESEND_API_KEY: "re_bad" }, MSG)).resolves.toBe(false);
  });
});
