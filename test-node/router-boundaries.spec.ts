import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// worker/index.ts owns the three middlewares that decide who can reach what:
// the security headers, the /api/* session gate and the /api/admin/* role
// gate. It was also the largest file in the repo and still growing with
// ordinary feature work, so a reviewer reasoning about auth had to hold a
// router full of unrelated handlers in their head at the same time.
//
// #703, #704 and #93 moved the route groups out. This keeps them out.
const ROOT = new URL("..", import.meta.url).pathname;
const INDEX = readFileSync(`${ROOT}worker/index.ts`, "utf8");

describe("the router file", () => {
  it("still owns the three middlewares", () => {
    // The point of shrinking it. If these ever move, this test should be
    // rewritten deliberately rather than deleted.
    expect(INDEX).toMatch(/app\.use\("\*"/);
    expect(INDEX).toMatch(/app\.use\("\/api\/\*"/);
    expect(INDEX).toMatch(/app\.use\("\/api\/admin\/\*"/);
  });

  it("does not grow back past where the split left it", () => {
    // A ratchet, like the coverage floor: not a target, a stop on sliding
    // back. Lowering it is the point; raising it means a route group went in
    // here instead of into a module of its own.
    const lines = INDEX.split("\n").length;
    expect(
      lines,
      "worker/index.ts is growing again — put new route groups in their own register*Routes module",
    ).toBeLessThanOrEqual(2100);
  });

  it("hands every extracted group to a register function", () => {
    // The convention that makes the above possible. A module that exports
    // routes some other way would be a second pattern to learn.
    const modules = readdirSync(`${ROOT}worker`)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts")
      .map((f) => [f, readFileSync(`${ROOT}worker/${f}`, "utf8")] as const);

    const registrars = modules
      .filter(([, src]) => /export function register\w+Routes/.test(src))
      .map(([name]) => name);
    expect(registrars.length, "no register*Routes modules found").toBeGreaterThan(4);

    for (const name of registrars) {
      const fn = modules
        .find(([f]) => f === name)![1]
        .match(/export function (register\w+Routes)/)![1];
      expect(INDEX, `${name} exports ${fn} and nothing calls it`).toContain(`${fn}(app)`);
    }
  });
});
