import { gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// "The first paint on mobile is a locked first-class target" is the reason
// the vendor chunks were split out in the first place (vite.config.ts). It
// has never had a number attached to it, so nothing notices the day the
// entry grows by a third — a redesign, a library, a stylesheet that stopped
// being code-split. This puts a number on it.
//
// Budgets are the measured size plus about 12%: enough headroom that an
// ordinary feature does not trip it, tight enough that a step change does.
// Raising one is fine — it just has to be a decision someone made, with the
// new figure written down here.
//
// Measured at the tip of the Fizzy-shell series (#535):
//   entry CSS  18.52 kB gzipped   (the whole redesign added 1.28 kB)
//   entry JS   61.13 kB gzipped   (the whole redesign added 1.44 kB)
//
// Gzip is a proxy here, not the shipped figure. Cloudflare serves these
// brotli — checked against a preview deployment, which returns
// content-encoding: br — and brotli comes out about 15% smaller:
//
//   entry CSS  18.08 kB gzip  →  15.38 kB brotli
//   entry JS   59.35 kB gzip  →  51.09 kB brotli
//
// The budget stays in gzip anyway: it exists to catch growth, both formats
// move together, and gzipSync is in node's standard library while brotli at
// quality 11 costs a second per file. What the number must not do is get
// quoted as "what the user downloads", which is smaller.
//
// Vendor chunks are deliberately not budgeted here. react/i18n are split so
// they cache across deploys, and their size is a dependency decision rather
// than something this app's own changes move.
const BUDGETS = { css: 21 * 1024, js: 69 * 1024 };

const DIST = new URL("../dist/client/assets", import.meta.url).pathname;

function entry(pattern: RegExp): { name: string; gzipped: number } | null {
  if (!existsSync(DIST)) return null;
  const match = readdirSync(DIST).find((f) => pattern.test(f));
  if (!match) return null;
  return {
    name: match,
    gzipped: gzipSync(readFileSync(join(DIST, match))).length,
  };
}

// A skip is loud rather than silent: a budget that quietly passes because
// nobody built is worse than no budget. CI builds before it tests.
const built = existsSync(DIST);

describe.skipIf(!built)("bundle budget", () => {
  it("keeps the entry stylesheet under budget", () => {
    const css = entry(/^index-.*\.css$/);
    expect(css, "no entry stylesheet in dist").toBeTruthy();
    expect(
      css!.gzipped,
      `${css!.name} is ${(css!.gzipped / 1024).toFixed(2)} kB gzipped`,
    ).toBeLessThanOrEqual(BUDGETS.css);
  });

  it("keeps the entry script under budget", () => {
    const js = entry(/^index-(?!es-).*\.js$/);
    expect(js, "no entry script in dist").toBeTruthy();
    expect(
      js!.gzipped,
      `${js!.name} is ${(js!.gzipped / 1024).toFixed(2)} kB gzipped`,
    ).toBeLessThanOrEqual(BUDGETS.js);
  });
});

describe.skipIf(built)("bundle budget", () => {
  it("needs a build first", () => {
    // Named so a local run says why it did nothing, instead of reporting a
    // pass it never checked.
    expect(built, "run `npm run build` before this spec (CI does)").toBe(false);
  });
});
