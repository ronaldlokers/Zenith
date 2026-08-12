import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Cloudflare answers a request whose path matches a real asset from the asset
// worker, without invoking this Worker at all. Everything in worker/index.ts
// — the session gate, the security headers, the Content-Security-Policy —
// simply does not run for those paths.
//
// Client routes are safe by accident: /board, /cv and /settings match no
// asset, so they fall through to the Worker and are served the SPA shell by
// app.notFound. "/" is the exception. It matches index.html, which made the
// one URL a person actually types the only document served with no policy on
// it. Measured on a preview deployment before the fix:
//
//   /board  200  content-security-policy: default-src 'self'; …
//   /       200  no security headers at all
//
// A Worker test cannot see this: SELF.fetch goes through the Worker by
// definition, so the headers are always there when the tests look. The only
// place it is visible is the config.
const CONFIG = new URL("../wrangler.jsonc", import.meta.url).pathname;

// JSONC, so the comments have to come off first — and the stripper has to
// respect strings, or a "//" inside one would truncate the file.
function stripComments(source: string): string {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (inLine) {
      if (c === "\n") { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") { inBlock = false; i++; }
      continue;
    }
    if (inString) {
      if (c === "\\") { out += c + (next ?? ""); i++; continue; }
      if (c === '"') inString = false;
      out += c;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && next === "/") { inLine = true; i++; continue; }
    if (c === "/" && next === "*") { inBlock = true; i++; continue; }
    out += c;
  }
  return out;
}

type Assets = {
  binding?: string;
  not_found_handling?: string;
  run_worker_first?: boolean | string[];
};

const config = JSON.parse(stripComments(readFileSync(CONFIG, "utf8"))) as {
  assets?: Assets;
};

describe("asset routing", () => {
  it("sends the document through the Worker so it gets the headers", () => {
    const first = config.assets?.run_worker_first;
    expect(first, "no run_worker_first: / would bypass the Worker").toBeDefined();
    const covered = first === true || (Array.isArray(first) && first.includes("/"));
    expect(
      covered,
      "run_worker_first must cover \"/\", or the root document is served " +
        "with no Content-Security-Policy and no security headers",
    ).toBe(true);
  });

  it("still hands unmatched routes to the SPA shell", () => {
    // The pair is load-bearing together: routing "/" through the Worker is
    // only harmless because the Worker knows how to serve the shell for a
    // path that is not an API route.
    expect(config.assets?.not_found_handling).toBe("single-page-application");
    expect(config.assets?.binding).toBe("ASSETS");
  });
});
