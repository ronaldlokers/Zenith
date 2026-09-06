import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Settings is the one place a user learns what their API key can do, and it
// listed two of the four endpoints that key opens. The two it omitted are the
// interesting ones: POST /applications creates records (it is what the browser
// extension's save-to-pipeline uses) and GET /profile reads their contact
// details. Someone reading this page to work out their key's blast radius was
// told the smaller half.
//
// The same page called the surface "read-only", which stopped being true when
// the write route arrived. test-node/doc-truth.spec.ts already guards that
// claim — but only across README/CLAUDE/PRODUCT/SELF_HOSTING, so the copy an
// actual user reads was the one place outside the net.
const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC_API = readFileSync(`${ROOT}worker/public-api.ts`, "utf8");
const DOCS_COMPONENT = readFileSync(`${ROOT}src/settings/api.tsx`, "utf8");

// Every route mounted under /api/v1, as the reference would have to spell it.
const routes = [...PUBLIC_API.matchAll(/\bapi\.(get|post|put|patch|delete)\("([^"]+)"/g)].map(
  (m) => `${m[1].toUpperCase()} ${m[2]}`,
);

describe("the in-app API reference", () => {
  it("found the routes it is supposed to describe", () => {
    // If this ever reads zero the two tests below pass vacuously.
    expect(routes.length).toBeGreaterThanOrEqual(4);
  });

  it("lists every endpoint the key opens", () => {
    const missing = routes.filter((r) => !DOCS_COMPONENT.includes(`<code>${r}</code>`));
    expect(
      missing,
      "these endpoints answer to a user's API key but are not in the reference they read",
    ).toEqual([]);
  });

  it("does not describe the surface as read-only while it accepts writes", () => {
    const writes = routes.filter((r) => !r.startsWith("GET "));
    if (writes.length === 0) return;
    for (const locale of ["en", "nl"]) {
      const copy = JSON.stringify(
        JSON.parse(readFileSync(`${ROOT}src/locales/${locale}.json`, "utf8")).apiDocs,
      );
      expect(
        copy,
        `${locale} calls the API read-only, but it accepts: ${writes.join(", ")}`,
      ).not.toMatch(/read-only|alleen-lezen|alleen lezen/i);
    }
  });
});
