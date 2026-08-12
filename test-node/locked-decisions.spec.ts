import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two of the product's locked decisions are promises to the person using it,
// and neither had anything stopping a future change from quietly breaking
// them. Both hold today; this is what keeps them holding.
//
//   "No telemetry / analytics. Privacy is a feature. Don't add tracking."
//   "Light only. There is no data-theme attribute and no
//    prefers-color-scheme branch anywhere in the CSS."
//
// A dependency is the likely way either goes: a component library that
// phones home, or a stylesheet that ships its own dark-mode block. Neither
// arrives as a decision someone typed.
const ROOT = new URL("..", import.meta.url).pathname;

function filesUnder(dir: string, test: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, test));
    else if (test.test(entry)) out.push(full);
  }
  return out;
}

describe("locked decision: light only", () => {
  it("has no dark-mode branch in any stylesheet", () => {
    // Not a style preference — the palette is tuned and contrast-tested
    // against one set of grounds. A second theme silently untunes it.
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "src"), /\.css$/)) {
      const css = readFileSync(file, "utf8");
      if (/prefers-color-scheme|\[data-theme/.test(css)) {
        offenders.push(file.replace(ROOT, ""));
      }
    }
    expect(offenders, "adding a theme back is a design decision, not a fix").toEqual(
      [],
    );
  });
});

describe("locked decision: no telemetry", () => {
  // Names that mean a request leaves for someone else's server. Matching the
  // word "analytics" alone is useless — the app has an Insights tab and
  // comments that say so — hence vendor names and beacon APIs.
  const TRACKERS = [
    "googletagmanager",
    "google-analytics",
    "gtag(",
    "mixpanel",
    "posthog",
    "amplitude",
    "segment.com",
    "analytics.js",
    "plausible.io",
    "fathom.com",
    "umami.is",
    "sentry.io",
    "@sentry/",
    "hotjar",
    "clarity.ms",
    "navigator.sendBeacon",
  ];

  it("ships no tracker in the source", () => {
    const hits: string[] = [];
    for (const file of filesUnder(join(ROOT, "src"), /\.(ts|tsx)$/)) {
      if (/\.test\.tsx?$/.test(file) || file.endsWith("locked-decisions.spec.ts")) continue;
      const src = readFileSync(file, "utf8");
      for (const t of TRACKERS) {
        if (src.includes(t)) hits.push(`${t} in ${file.replace(ROOT, "")}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("loads nothing from a third party in the page shell", () => {
    // Fonts are self-hosted (/fonts/*.woff2) precisely so no request leaves
    // for a CDN on first paint. A stylesheet or script from another origin
    // would tell that origin who is using the app and when.
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const origins = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(origins, "everything the shell loads is served by this app").toEqual([]);
  });
});
