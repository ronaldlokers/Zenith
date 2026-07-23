import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Login rate limiting (security review, #445). Better Auth's default special
// rule throttles /sign-in* to 3 attempts / 10s; without the explicit
// rateLimit config in worker/auth.ts it was off in the deployed Worker
// (NODE_ENV never set), leaving password + 2FA brute force unthrottled.
// This file's D1 storage is isolated, so the throttle budget starts fresh.
const BASE = "http://zenith.test";

function signInAttempt() {
  return SELF.fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Wrong password on purpose — the limiter counts every attempt, so we
    // don't need (or want) a real session here.
    body: JSON.stringify({ email: "nobody@zenith.test", password: "wrong-pw" }),
  });
}

describe("login rate limiting", () => {
  it("throttles repeated sign-in attempts with 429", async () => {
    // First three attempts pass the limiter (they fail auth with 401, not 429).
    for (let i = 0; i < 3; i++) {
      const res = await signInAttempt();
      expect(res.status).not.toBe(429);
    }
    // The fourth within the 10s window is rejected by the limiter.
    const throttled = await signInAttempt();
    expect(throttled.status).toBe(429);
  });
});
