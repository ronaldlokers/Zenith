import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The share page's momentum verdict was a second implementation of the same
// recent-vs-prior ratio the app computes, and it had missed the small-n floor
// added to the original (see test/share-momentum.spec.ts). Both surfaces now
// call computePipelineMomentum.
//
// This is what stops a third copy: a fresh inline ratio in the worker would
// pass every behavioural test on the day it was written and diverge the next
// time the rule moves, which is exactly how the first one got there.
const ROOT = new URL("..", import.meta.url).pathname;
// Every worker file, not index.ts alone. The share page moved to
// worker/share.ts in #100 and this guard failed — correctly, but for the wrong
// reason: it was pinning where the call lives rather than that there is only
// one implementation. Reading the whole directory says what it means and
// survives the next move.
const WORKER = readdirSync(`${ROOT}worker`)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(`${ROOT}worker/${f}`, "utf8"))
  .join("\n");

describe("the momentum rule", () => {
  it("is called by the worker rather than reimplemented anywhere in it", () => {
    expect(WORKER).toContain("computePipelineMomentum");
  });

  it("has no second ratio living in the worker", () => {
    expect(
      /\(\s*recent\w*\s*-\s*prior\w*\s*\)\s*\/\s*prior/i.test(WORKER),
      "a worker file computes its own momentum ratio again",
    ).toBe(false);
  });

  it("keeps its floor where both callers get it", () => {
    const shared = readFileSync(`${ROOT}src/momentum.ts`, "utf8");
    expect(shared).toMatch(/recent \+ prior < MOMENTUM_MIN_EVENTS/);
  });

  it("keeps the share page off its own copy of the stage order", () => {
    // The same defect in its other half: the page listed the five pipeline
    // stages again, so a change to the order would have moved the board and
    // left the public funnel behind.
    expect(WORKER).not.toMatch(/SHARE_PIPELINE/);
  });
});
