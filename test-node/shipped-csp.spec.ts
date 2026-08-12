import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Content-Security-Policy relaxes in dev, because @cloudflare/vite-plugin
// runs the Worker in front of the dev server and Vite's React Refresh
// preamble is an inline script — under script-src 'self' the app is simply
// blank. The relaxation is keyed on import.meta.env.MODE, which Vite
// substitutes at build time, so the deployed bundle should contain the strict
// string and no branch at all.
//
// That is the whole safety argument, and every other test takes it on trust:
// the Worker tests run under MODE "test", so they assert the strict policy
// without ever proving the production build produces it. If the substitution
// stopped happening — a bundler change, a mode renamed, someone reaching for
// DEV again (which the test runner also sets) — every one of them would still
// pass while the deployment shipped 'unsafe-inline'.
const BUNDLE = new URL("../dist/zenith/index.js", import.meta.url).pathname;
const built = existsSync(BUNDLE);

describe.skipIf(!built)("shipped policy", () => {
  const source = built ? readFileSync(BUNDLE, "utf8") : "";

  it("ships script-src with nothing unsafe in it", () => {
    const found = [...source.matchAll(/script-src '[^"'`]*(?:'[^"'`]*)*/g)].map(
      (m) => m[0].trim(),
    );
    expect(found.length, "no script-src in the built Worker").toBeGreaterThan(0);
    for (const directive of found) {
      expect(directive, `built Worker ships: ${directive}`).not.toContain(
        "unsafe-inline",
      );
      expect(directive).not.toContain("unsafe-eval");
    }
  });

  it("compiles the dev branch out rather than shipping a runtime check", () => {
    // A surviving MODE comparison would mean the branch is decided at
    // runtime, where a stray environment value could pick the wrong one.
    expect(source).not.toMatch(/env\??\.MODE/);
  });
});

describe.skipIf(built)("shipped policy", () => {
  it("needs a build first", () => {
    expect(built, "run `npm run build` before this spec (CI does)").toBe(false);
  });
});
