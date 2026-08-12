import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// A deployment was answering with none of these. The app holds CVs, salary
// figures and private notes behind a session cookie, and it has one-click
// destructive actions — delete an application, delete the account — so
// nothing stopping another site framing it was the gap that mattered.
//
// Checked on three surfaces because they are served by different paths
// through the Worker: a client route handed to the SPA shell, an API route
// that refuses, and the public share page.
const BASE = "http://zenith.test";

const EXPECTED: Record<string, string> = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

describe("security headers", () => {
  it.each([
    ["a client route", "/board"],
    ["an unauthenticated API call", "/api/applications"],
    ["the public share page", "/shared/does-not-exist"],
  ])("sets them on %s", async (_what, path) => {
    const res = await SELF.fetch(`${BASE}${path}`, {
      headers: { Accept: "text/html" },
    });
    for (const [header, value] of Object.entries(EXPECTED)) {
      expect(res.headers.get(header), `${path} is missing ${header}`).toBe(value);
    }
  });
});
