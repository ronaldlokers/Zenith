import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

  it("documents the infrastructure an exported handler needs", () => {
    // A secret at least has a name a self-hoster can search for. The email()
    // handler has nothing: it is enabled entirely from the Cloudflare
    // dashboard, appears nowhere in wrangler.jsonc, and fires only if someone
    // has pointed Email Routing at the Worker. Neither README nor
    // SELF_HOSTING.md mentioned Email Routing at all, so a shipped feature —
    // forward a recruiter's mail, get the interaction logged — was
    // undiscoverable and unenablable from the docs.
    //
    // Same for scheduled(): the crons live in wrangler.jsonc, but what they do
    // and what they need is not something a triggers array explains.
    const index = readFileSync(join(ROOT, "worker/index.ts"), "utf8");
    if (!/async email\(/.test(index)) return;
    const selfHosting = read("SELF_HOSTING.md");
    expect(
      /email routing/i.test(selfHosting),
      "the worker exports an email() handler and SELF_HOSTING.md never says how to point mail at it",
    ).toBe(true);
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

  it("names script and file paths that exist on disk", () => {
    // A doc that says "run scripts/restore-backup.mjs" is a promise the file
    // is still there. Nothing checked that promise, so a rename would leave
    // SELF_HOSTING.md pointing a recovery procedure at nothing — discovered
    // only when someone needs it.
    //
    // Two shapes count as "a path the doc names": an inline `` `scripts/…` ``
    // backtick span with a slash and an extension (the style every doc uses
    // for worker/index.ts, test-node/*.spec.ts, scripts/*.mjs alike), and a
    // bare `scripts/*.mjs` mention inside a fenced shell example, which
    // carries no backticks of its own. Deliberately excluded:
    //   - a wildcard like `scripts/*.mjs` — `*` is not in the path charset,
    //     so a glob in prose can't be misread as a real file
    //   - a URL path segment — the charset excludes `:`, so `https://…`
    //     never starts a match
    //   - `scripts/.seed-admin.sql`, which SELF_HOSTING.md names as the file
    //     seed-admin.mjs *writes*, not one already checked in — the bare
    //     pattern is scoped to `.mjs` so a generated, gitignored output path
    //     doesn't fail this guard for correctly describing itself
    const PATH_IN_BACKTICKS = /`([\w.-]+(?:\/[\w.-]+)+\.\w+)`/g;
    const BARE_SCRIPT = /\bscripts\/[\w.-]+\.mjs\b/g;

    const found = new Map<string, Set<string>>();
    for (const doc of DOCS) {
      const text = read(doc);
      for (const m of text.matchAll(PATH_IN_BACKTICKS)) {
        (found.get(m[1]) ?? found.set(m[1], new Set()).get(m[1])!).add(doc);
      }
      for (const m of text.matchAll(BARE_SCRIPT)) {
        (found.get(m[0]) ?? found.set(m[0], new Set()).get(m[0])!).add(doc);
      }
    }

    expect(
      found.size,
      "no repo-relative paths found in the docs — has the naming style changed?",
    ).toBeGreaterThan(0);

    const missing = [...found.entries()]
      .filter(([p]) => !existsSync(join(ROOT, p)))
      .map(([p, docs]) => `${p} (named in ${[...docs].join(", ")})`);
    expect(missing, "these docs name paths that do not exist on disk").toEqual([]);
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

// CLAUDE.md is the standing brief — the file every agent and every new reader
// is told to treat as binding. Two of its claims had drifted, and drift there
// costs more than drift in a README: a brief that has to be read as historical
// erodes exactly the trust it exists to provide.
//
// verification-list.spec.ts already checks the *list* of gates against CI. It
// does not look inside them, which is how the coverage floor could be raised
// twice without the sentence naming it moving at all.
describe("the standing brief", () => {
  const claudeMd = read("CLAUDE.md");

  it("quotes the coverage floor that is actually enforced", () => {
    const config = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");
    const threshold = (name: string) =>
      Number(config.match(new RegExp(`${name}:\\s*(\\d+)`))?.[1]);

    // The sentence names statements and functions; the config carries four.
    // Reading them from the config rather than hardcoding here keeps this test
    // from becoming the third copy that drifts.
    for (const [name, value] of [
      ["statements", threshold("statements")],
      ["functions", threshold("functions")],
    ] as const) {
      expect(Number.isFinite(value), `no ${name} threshold in vitest.config.ts`).toBe(true);
      expect(
        claudeMd,
        `CLAUDE.md does not name the enforced ${name} floor of ${value}%`,
      ).toContain(`${value}% ${name}`);
    }
  });

  it("does not claim a file was split while it is still sitting there", () => {
    // "settings.tsx → src/settings/, network.tsx → …, and cv.tsx → src/cv/
    // have since been split" read as three clean moves. Two were; cv.tsx is
    // still at the top level, importing from the directory it supposedly
    // became. A reader looking for it where the sentence implies finds nothing.
    const sentence = claudeMd.match(/\(`[^)]*have since been split[^)]*\)/)?.[0] ?? "";
    const named = [...sentence.matchAll(/`([a-z-]+\.tsx)`\s*→/g)].map((m) => m[1]);
    expect(named.length, "the split sentence has moved or been reworded").toBeGreaterThan(0);
    const stillThere = named.filter((f) => existsSync(join(ROOT, "src", f)));
    expect(
      stillThere,
      "CLAUDE.md says these were split, but they are still at the top level of src/",
    ).toEqual([]);
  });
});
