import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Three claims in the docs had quietly stopped being true, and nothing could
// tell: the README advertised three themes after light-only was locked,
// SELF_HOSTING omitted two secrets the worker requires, and README, CLAUDE.md
// and PRODUCT.md all called /api/v1 read-only after #477 added a write route
// to it. That last one hands the wrong threat model to someone deciding
// whether to paste a key into a browser extension.
//
// Prose drifts because nothing runs it. These are the claims cheap enough to
// check against the code that makes them true or false.
const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const DOCS = ["README.md", "CLAUDE.md", "PRODUCT.md", "SELF_HOSTING.md"];

describe("the docs describe the app that exists", () => {
  it("does not call /api/v1 read-only while it accepts writes", () => {
    const api = read("worker/public-api.ts");
    const writes = [...api.matchAll(/api\.(post|put|patch|delete)\(\s*"([^"]+)"/g)].map(
      (m) => `${m[1].toUpperCase()} ${m[2]}`,
    );
    // If the surface ever does become read-only, this flips to guarding the
    // claim instead of forbidding it — but today it is not, and saying so is
    // a security statement, not a wording preference.
    expect(writes.length, "no write routes found — has public-api.ts moved?").toBeGreaterThan(0);

    const offenders = DOCS.filter((doc) => /read-only\s*`?\/api\/v1|`\/api\/v1[^`]*`\s*\(read-only/i.test(read(doc)))
      .concat(DOCS.filter((doc) => /read-only (REST )?API\*{0,2}\s*\(`\/api\/v1/i.test(read(doc))));
    expect(
      [...new Set(offenders)],
      `these docs call /api/v1 read-only, but it accepts: ${writes.join(", ")}`,
    ).toEqual([]);
  });

  it("does not advertise a theme picker that was removed", () => {
    // Light-only is a locked decision with a CSS guard in
    // locked-decisions.spec.ts. That guard reads stylesheets, so the README
    // kept promising Automatic/Light/Dark long after the code stopped
    // offering it.
    const offenders = DOCS.filter((doc) =>
      /(three|3)\s+themes|Automatic\s*\/\s*Light\s*\/\s*Dark/i.test(read(doc)),
    );
    expect(offenders, "light-only is locked; these docs still offer a theme choice").toEqual([]);
  });

  it("documents every secret the worker reads", () => {
    // A missing secret is silent by design here — each feature degrades
    // rather than erroring — so the only symptom is a self-hoster whose
    // digest never arrives and who has nothing to search for.
    const workerSource = workerFiles()
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const secrets = new Set(
      [...workerSource.matchAll(/env\.([A-Z][A-Z0-9_]{2,})/g)]
        .map((m) => m[1])
        // Bindings, not secrets: these come from wrangler.jsonc and the
        // walkthrough covers them where it creates the D1 database and bucket.
        .filter((name) => !["DB", "DOCS", "ASSETS"].includes(name)),
    );
    expect(secrets.size, "no env secrets found — has the worker layout moved?").toBeGreaterThan(0);

    const selfHosting = read("SELF_HOSTING.md");
    const undocumented = [...secrets].filter((s) => !selfHosting.includes(s)).sort();
    expect(
      undocumented,
      "the worker reads these and SELF_HOSTING.md never names them",
    ).toEqual([]);
  });
});

function workerFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".ts")) out.push(full);
    }
  };
  walk(join(ROOT, "worker"));
  return out;
}
