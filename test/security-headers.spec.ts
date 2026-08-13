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

  it("gives the app its default referrer policy", async () => {
    const res = await SELF.fetch(`${BASE}/board`, {
      headers: { Accept: "text/html" },
    });
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("lets a tokenised page keep a stricter referrer policy", async () => {
    // The share and calendar URLs carry their token in the path, so they opt
    // into no-referrer — and the global middleware used to overwrite it on
    // the way out, exactly as it once would have flattened their CSP. Same
    // precedent, now applied to both: a route that has chosen something
    // stricter keeps it.
    for (const path of ["/shared/does-not-exist", "/calendar/does-not-exist"]) {
      const res = await SELF.fetch(`${BASE}${path}`);
      expect(res.headers.get("referrer-policy"), `${path}`).toBe("no-referrer");
    }
  });
});

describe("content security policy", () => {
  it("refuses inline and injected script on a client route", async () => {
    // The directive the whole policy is for. 'unsafe-inline' or 'unsafe-eval'
    // creeping into script-src would leave the header in place while removing
    // the only protection it offers, which is the failure this guards.
    const res = await SELF.fetch(`${BASE}/board`, {
      headers: { Accept: "text/html" },
    });
    const csp = res.headers.get("content-security-policy") ?? "";
    const scriptSrc = csp.split(";").map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrc, "no script-src in the policy").toBeTruthy();
    expect(scriptSrc).toBe("script-src 'self'");
  });

  it("allows style attributes but not inline <style>", async () => {
    // React writes this UI's geometry into style attributes. Dropping
    // style-src-attr takes the funnel bars and the ascent strip with it;
    // widening it to style-src would also readmit inline <style>.
    const res = await SELF.fetch(`${BASE}/board`, {
      headers: { Accept: "text/html" },
    });
    const csp = res.headers.get("content-security-policy") ?? "";
    const directives = Object.fromEntries(
      csp.split(";").map((d) => {
        const [name, ...rest] = d.trim().split(/\s+/);
        return [name, rest.join(" ")];
      }),
    );
    expect(directives["style-src-attr"]).toBe("'unsafe-inline'");
    expect(directives["style-src"]).toBe("'self'");
  });

  it("leaves the share page its own stricter policy", async () => {
    // The middleware runs after the handler, so a blanket c.header() would
    // overwrite the nonced policy the share page builds — silently, and only
    // in production, where that page is the one thing served to strangers.
    const { env } = await import("cloudflare:test");
    const { authedFetch } = await import("./helpers");
    const token = "csp-share-token";
    await authedFetch(`${BASE}/api/profile/share-token`, { method: "POST" });
    await env.DB.prepare("UPDATE profile SET share_token = ? WHERE user_id = ?")
      .bind(token, "seed-admin")
      .run();

    const res = await SELF.fetch(`${BASE}/shared/${token}`);
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp, "the app policy overwrote the share page's").toContain("nonce-");
    expect(csp).toContain("default-src 'none'");
  });
});
