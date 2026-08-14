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

  // Two call sites bounded their fetch and wrote down why — the webhook
  // delivery ("a slow/hanging receiver must not tie up the delivery") and the
  // stale-posting cron. Nothing else adopted it: the three AI calls, the push
  // sender, the three feed pulls and the email provider all waited forever.
  // Every one of them runs either in a cron nobody is watching or behind a
  // spinner with no way back but a reload.
  //
  // Checked as a rule rather than as a list, because the list was the problem:
  // the pattern existed in the codebase and simply was not reached for.
  it("never waits forever on someone else's server", () => {
    const unbounded: string[] = [];
    for (const file of workerFiles()) {
      const rel = file.replace(ROOT, "");
      // url-guard passes the caller's init straight through, so the signal
      // belongs to whoever called it; index.ts's only fetch is the ASSETS
      // binding, which is not the network.
      if (rel === "worker/url-guard.ts" || rel === "worker/index.ts") continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const code = line.trim();
        // Prose mentions the call too — push.ts explains what its fetch sends.
        if (code.startsWith("//") || code.startsWith("*")) return;
        if (!/(?<![.\w])fetch\(/.test(line)) return;
        // The call runs to the line that closes it; a signal anywhere inside
        // counts, however the object literal is formatted.
        const rest = lines.slice(i, i + 20).join("\n");
        const close = rest.indexOf("});");
        const call = close >= 0 ? rest.slice(0, close) : rest;
        if (!/signal:/.test(call)) unbounded.push(`${rel}:${i + 1}`);
      });
    }
    expect(
      unbounded,
      "an outbound fetch with no AbortSignal — a hang here stalls a cron or a spinner",
    ).toEqual([]);
  });
});
