import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "../worker/email/index";

// Observability is on in wrangler.jsonc, so anything written to console.error
// is retained in Cloudflare's log platform — outside this app's data boundary.
//
// resend.ts throws `resend ${status}: ${await res.text()}` deliberately: the
// admin test-send calls the provider directly and shows the provider's own
// words, and "domain not verified" against "bad key" are different problems.
// But sendEmail logged that same Error whole, and a provider's 4xx body can
// quote the address it rejected — so a delivery failure could write a user's
// email address into an external log.
//
// The status is kept, because "422" against "500" is the whole diagnostic
// value; the body is not, because that is where the address is.
const realFetch = globalThis.fetch;
const RECIPIENT = "someone.private@example.com";

function stubResend(status: number, body: string) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.resend.com/")) {
      return Promise.resolve(new Response(body, { status }));
    }
    return realFetch(input, init);
  });
}

const send = () =>
  sendEmail({ ...env, RESEND_API_KEY: "re_test", EMAIL_FROM: "Zenith <z@example.com>" } as Env, {
    to: RECIPIENT,
    subject: "s",
    html: "<p>h</p>",
    text: "t",
  });

afterEach(() => vi.unstubAllGlobals());

describe("what a failed send writes to the log", () => {
  it("does not echo the provider body, which can quote the address", async () => {
    const logged: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...a) => void logged.push(...a));
    stubResend(422, JSON.stringify({ message: `Invalid to field: ${RECIPIENT}` }));

    expect(await send()).toBe(false);

    const text = logged.map((x) => (x instanceof Error ? x.message : String(x))).join(" ");
    expect(text, "a user's address reached an external log").not.toContain(RECIPIENT);
  });

  it("still says enough to diagnose it", async () => {
    // A log that says only "email send failed" is not worth writing.
    const logged: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...a) => void logged.push(...a));
    stubResend(422, JSON.stringify({ message: `Invalid to field: ${RECIPIENT}` }));

    await send();

    const text = logged.map((x) => (x instanceof Error ? x.message : String(x))).join(" ");
    expect(text, "the status is gone, so 422 and 500 look the same").toContain("422");
  });

  it("leaves the thrown error whole for the admin test-send", async () => {
    // That route calls the provider directly to show its real words. Redacting
    // at the throw site would have taken that away too.
    const { resolveProvider } = await import("../worker/email/index");
    stubResend(422, `Invalid to field: ${RECIPIENT}`);
    const provider = resolveProvider({ ...env, RESEND_API_KEY: "re_test" } as Env);
    await expect(
      provider!.send({ to: RECIPIENT, subject: "s", html: "h", text: "t" }),
    ).rejects.toThrow(RECIPIENT);
  });
});

describe("summarizing an error whose shape is unknown", () => {
  it("withholds the message rather than guessing it is safe", async () => {
    // The important direction. A message this does not recognise is exactly
    // the one whose contents cannot be vouched for, so the default is to say
    // nothing about it — not to pass it through because it looked harmless.
    const { summarizeSendError } = await import("../worker/email/index");
    expect(summarizeSendError(new Error(`connect failed for ${RECIPIENT}`))).toBe(
      "Error (message withheld)",
    );
    expect(summarizeSendError(RECIPIENT)).toBe("non-error thrown");
    expect(summarizeSendError(new TypeError("x"))).toBe("TypeError (message withheld)");
  });

  it("keeps the provider and status it does recognise", async () => {
    const { summarizeSendError } = await import("../worker/email/index");
    expect(summarizeSendError(new Error('resend 422: {"to":"a@b.c"}'))).toBe(
      "resend responded 422",
    );
  });
});
