import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// "All server-side fetches of user-supplied URLs go through
// worker/url-guard.ts (SSRF guard)." That rule is kept by memory, and the
// day it stops being kept there is no error — the request simply goes
// wherever it was pointed. The platform's global_fetch_strictly_public flag
// blocks private addresses, which is a floor, not the whole guard: it says
// nothing about redirects, schemes, or which public host gets reached.
//
// Every outbound call in worker/ must therefore be one of:
//   - guardedFetch(...)                    — the guard
//   - fetch("https://fixed.host/...")      — a host this app chose
//   - fetch(CONST) where CONST is an https:// literal in the same file —
//     naming a fixed endpoint is better style than inlining it, and the
//     check should not push anyone the other way
//   - listed below, with the reason        — a deliberate exception
const ROOT = new URL("..", import.meta.url).pathname;

// Exceptions, each stating why the call is safe without the guard. Adding
// one is the point: it should take an argument, not a shrug.
const ALLOWED: Record<string, string> = {
  "worker/feed.ts":
    "three fixed API hosts (adzuna, greenhouse, ashby); the user's part is a " +
    "query or path segment, encodeURIComponent'd, so it cannot move the host",
  "worker/push.ts":
    "the endpoint comes from the browser's own Push subscription, not from " +
    "anything a user types",
  "worker/url-guard.ts": "the guard itself",
  "worker/index.ts": "ASSETS.fetch — the assets binding, not the network",
};

function workerFiles(dir = join(ROOT, "worker")): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...workerFiles(full));
    else if (/\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

describe("outbound fetch", () => {
  it("never leaves for somewhere a caller chose", () => {
    const unguarded: string[] = [];
    for (const file of workerFiles()) {
      const rel = file.replace(ROOT, "");
      const source = readFileSync(file, "utf8");
      // Module constants holding a fixed https:// URL count as literals.
      const fixedConsts = new Set(
        [...source.matchAll(/const\s+(\w+)\s*=\s*"https:\/\/[^"]*"/g)].map(
          (m) => m[1],
        ),
      );
      const lines = source.split("\n");
      lines.forEach((line, i) => {
        // Only calls, not the word in a comment or an identifier.
        const m = line.match(/(?<![.\w])fetch\(/);
        if (!m) return;
        if (/guardedFetch\(/.test(line)) return;
        // A literal host this app picked.
        if (/fetch\(\s*[`"]https:\/\//.test(line)) return;
        const named = line.match(/fetch\(\s*(\w+)\s*[,)]/);
        if (named && fixedConsts.has(named[1])) return;
        if (ALLOWED[rel]) return;
        unguarded.push(`${rel}:${i + 1}  ${line.trim().slice(0, 60)}`);
      });
    }
    expect(
      unguarded,
      "route this through guardedFetch, or add it to ALLOWED with a reason",
    ).toEqual([]);
  });

  it("still has a guard to route through", () => {
    // The exceptions above are only defensible while the guard exists and is
    // doing something: an empty url-guard would make every one of them a
    // statement about nothing.
    const guard = readFileSync(join(ROOT, "worker/url-guard.ts"), "utf8");
    expect(guard).toContain("export");
    expect(guard).toMatch(/isForbiddenUrl|guardedFetch/);
    // Redirects are the half a platform flag does not cover: a public URL
    // that 302s somewhere else.
    expect(guard, "the guard should follow redirects itself").toMatch(
      /redirect|location/i,
    );
  });
});
