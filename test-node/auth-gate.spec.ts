import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Hono applies middleware to what is registered after it. The session gate
// sits partway down worker/index.ts, so a route added above it is public and
// nothing says so — no error, no failing test, just an endpoint anyone can
// call. This reads the file in registration order and checks that never
// happens by accident.
//
// It is a source test rather than a request test on purpose: a request test
// can only probe the routes someone thought to list, which is the same drift
// that put six tables outside the backup.
const SRC = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const LINES = SRC.split("\n");

const GATE = 'app.use("/api/*"';

// Registered above the gate on purpose, each with a reason.
const DELIBERATELY_PUBLIC = [
  // Refuses every sign-up: invite-only. Nothing to protect, and it has to
  // answer before the session check or it would 401 instead of explaining.
  '/api/auth/sign-up/email',
];

// Registrars called above the gate. /api/v1/* carries its own Bearer-key
// auth and must not sit behind the session cookie, or an external caller
// would 401 before reaching it.
const DELIBERATE_REGISTRARS = ["registerPublicApiRoutes"];

function lineOf(needle: string): number {
  const i = LINES.findIndex((l) => l.includes(needle));
  expect(i, `not found in worker/index.ts: ${needle}`).toBeGreaterThan(-1);
  return i;
}

describe("session gate", () => {
  const gate = lineOf(GATE);

  it("has every /api route registered behind it", () => {
    const early: string[] = [];
    LINES.slice(0, gate).forEach((line, i) => {
      const m = line.match(/app\.(get|post|put|patch|delete|all)\(\s*"([^"]+)"/);
      if (!m) return;
      const [, verb, path] = m;
      if (!path.startsWith("/api/")) return;
      if (DELIBERATELY_PUBLIC.includes(path)) return;
      early.push(`${verb.toUpperCase()} ${path} (line ${i + 1})`);
    });
    expect(
      early,
      "these are above the session middleware, so they answer without one",
    ).toEqual([]);
  });

  it("has every route registrar called behind it, bar the documented ones", () => {
    const early: string[] = [];
    LINES.slice(0, gate).forEach((line, i) => {
      const m = line.match(/^(register\w+)\(app\)/);
      if (!m) return;
      if (DELIBERATE_REGISTRARS.includes(m[1])) return;
      early.push(`${m[1]} (line ${i + 1})`);
    });
    expect(
      early,
      "a registrar above the gate makes every route it adds public",
    ).toEqual([]);
  });

  it("still has the admin check after the session check", () => {
    // The admin gate reads the role the session gate puts on the context, so
    // the order between them is load-bearing: swapped, every admin route
    // would see an empty role and refuse everyone.
    expect(lineOf('app.use("/api/admin/*"')).toBeGreaterThan(gate);
  });
});
