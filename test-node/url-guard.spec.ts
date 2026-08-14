import { afterEach, describe, expect, it, vi } from "vitest";
import { guardedFetch, isForbiddenUrl } from "../worker/url-guard";

// The app's stated boundary — "all server-side fetches of user-supplied URLs
// go through the SSRF guard" — had two spot checks against it, both at the
// API level: one webhook pointing at 169.254.169.254 and one import pointing
// at 127.0.0.1. The policy itself was never exercised directly.
//
// Most of what follows passes for a reason that is not visible in the guard:
// the WHATWG URL parser canonicalises the host before the guard ever sees it,
// so decimal, hex, octal, short-form, fullwidth and ideographic spellings of
// 127.0.0.1 all arrive as "127.0.0.1". That is worth pinning precisely
// because it is load-bearing and invisible — a future version that pattern-
// matched the raw string instead of parsing first would reopen every one of
// these at once, and nothing else in the suite would notice.
const BLOCKED = [
  // Loopback, spelled every way a URL can spell it.
  ["loopback, dotted", "http://127.0.0.1/"],
  ["loopback, decimal", "http://2130706433/"],
  ["loopback, hex", "http://0x7f000001/"],
  ["loopback, octal", "http://0177.0.0.1/"],
  ["loopback, short form", "http://127.1/"],
  ["loopback, trailing dot", "http://127.0.0.1./"],
  ["loopback, fullwidth digits", "http://①②⑦.0.0.1/"],
  ["loopback, ideographic stops", "http://127。0。0。1/"],
  ["localhost", "http://localhost/"],
  ["localhost, uppercase", "http://LOCALHOST/"],
  ["a .localhost suffix", "http://evil.localhost/"],
  ["a .internal suffix", "http://metadata.internal/"],
  ["a .home.arpa suffix", "http://router.home.arpa/"],
  // Cloud metadata and the private ranges.
  ["link-local metadata", "http://169.254.169.254/latest/meta-data/"],
  ["private 10/8", "http://10.0.0.1/"],
  ["private 172.16/12", "http://172.20.10.5/"],
  ["private 192.168/16", "http://192.168.1.1/"],
  ["CGNAT 100.64/10", "http://100.100.0.1/"],
  ["this-network 0/8", "http://0.0.0.0/"],
  ["multicast", "http://224.0.0.1/"],
  ["broadcast", "http://255.255.255.255/"],
  // v6 is refused wholesale rather than enumerated.
  ["v6 loopback", "http://[::1]/"],
  ["v6 unique-local", "http://[fc00::1]/"],
  // Schemes that are not a web fetch at all.
  ["file scheme", "file:///etc/passwd"],
  ["data scheme", "data:text/plain,hi"],
  ["ftp scheme", "ftp://example.com/x"],
] as const;

const ALLOWED = [
  ["an ordinary host", "https://boards.greenhouse.io/acme/jobs/1"],
  ["a public IP", "https://93.184.216.34/"],
  ["a host that merely contains a blocked word", "https://localhost.example.com/"],
  ["172.15, just outside the private range", "https://172.15.0.1/"],
  ["172.32, just outside the other end", "https://172.32.0.1/"],
  ["100.63, just below CGNAT", "https://100.63.0.1/"],
  ["100.128, just above CGNAT", "https://100.128.0.1/"],
  ["223, just below multicast", "https://223.255.255.255/"],
] as const;

describe("SSRF policy", () => {
  for (const [name, url] of BLOCKED) {
    it(`refuses ${name}`, () => {
      expect(isForbiddenUrl(new URL(url))).toBe(true);
    });
  }

  for (const [name, url] of ALLOWED) {
    it(`allows ${name}`, () => {
      // The boundaries matter as much as the ranges: a guard that blocks
      // everything is not a guard, it is an outage, and the off-by-one at
      // each edge is where that starts.
      expect(isForbiddenUrl(new URL(url))).toBe(false);
    });
  }
});

// The redirect handling had no test at all, which is the half of the guard
// that a policy check on the initial URL cannot cover.
describe("following redirects", () => {
  /** Stubs fetch with a fixed chain: each url answers with the next hop. */
  function chain(hops: Record<string, string>) {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(url);
      const to = hops[url];
      return to
        ? new Response(null, { status: 302, headers: { location: to } })
        : new Response("ok", { status: 200 });
    });
    return seen;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies the policy to every hop, not just the first", async () => {
    // The whole point of following them by hand: a public URL that redirects
    // to the metadata endpoint is the standard way past a guard that only
    // reads what it was given.
    chain({ "https://ok.example/a": "http://169.254.169.254/latest/" });
    await expect(guardedFetch("https://ok.example/a")).rejects.toThrow(
      /forbidden host/,
    );
  });

  it("gives up rather than looping forever", async () => {
    chain({ "https://ok.example/a": "https://ok.example/a" });
    await expect(guardedFetch("https://ok.example/a")).rejects.toThrow(
      /too many redirects/,
    );
  });

  it("follows a redirect off the origin by default", async () => {
    // A job posting that moved host is the ordinary case for the scraper.
    const seen = chain({ "https://old.example/job": "https://new.example/job" });
    const { finalUrl } = await guardedFetch("https://old.example/job");
    expect(finalUrl).toBe("https://new.example/job");
    expect(seen).toHaveLength(2);
  });

  it("refuses to carry a webhook payload off its origin", async () => {
    chain({ "https://hooks.example/x": "https://elsewhere.example/x" });
    await expect(
      guardedFetch("https://hooks.example/x", {}, { sameOriginRedirectsOnly: true }),
    ).rejects.toThrow(/left the origin/);
  });

  it("still follows the redirects a webhook receiver actually sends", async () => {
    // Trailing slash and http-to-https are the ones that occur; failing those
    // would break working webhooks to prevent nothing.
    const seen = chain({ "https://hooks.example/x": "https://hooks.example/x/" });
    const { res } = await guardedFetch(
      "https://hooks.example/x",
      {},
      { sameOriginRedirectsOnly: true },
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual(["https://hooks.example/x", "https://hooks.example/x/"]);
  });
});
