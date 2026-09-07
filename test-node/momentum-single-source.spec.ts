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

// Named pairs rather than one joined blob: the copy check has to report which
// file carries the duplicate, and a blob can only say that one exists.
function tsFiles(dir: string): [string, string][] {
  const out: [string, string][] = [];
  for (const entry of readdirSync(`${ROOT}${dir}`, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...tsFiles(rel));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push([rel, readFileSync(`${ROOT}${rel}`, "utf8")]);
    }
  }
  return out;
}
const srcFiles = () => tsFiles("src");
const workerFiles = () => tsFiles("worker");

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

  it("has no second copy of the date parser anywhere", () => {
    // The same defect as the ratio above, and it has now happened twice: the
    // worker carried shareParseSqlDate, and after that was removed src/stats.ts
    // still had sqlMs — byte for byte the same expression under a third name.
    // Both were written as deliberate copies for a reason that has since
    // dissolved, which is why a behavioural test cannot catch the next one:
    // a fresh copy is correct on the day it is written and only wrong later.
    //
    // The fingerprint is the branch, not the replace. worker/calendar.ts does
    // an unconditional replace for an ICS sequence number and falls back to 0
    // rather than NaN — a different function that happens to share a substring,
    // and deliberately not caught here.
    const files = [...srcFiles(), ...workerFiles()].filter(
      ([name]) => name !== "src/momentum.ts",
    );
    const copies = files
      .filter(([, text]) => /\.includes\("T"\)\s*\?/.test(text))
      .map(([name]) => name);
    expect(
      copies,
      "these reimplement parseSqlDate instead of importing it from src/momentum.ts",
    ).toEqual([]);
  });

  it("keeps the share page off its own copy of the stage order", () => {
    // The same defect in its other half: the page listed the five pipeline
    // stages again, so a change to the order would have moved the board and
    // left the public funnel behind.
    expect(WORKER).not.toMatch(/SHARE_PIPELINE/);
  });
});

// The If-Match comparison had been written four times — once in cv.ts and
// once in each of index.ts's three PUTs — before worker/if-match.ts collected
// it. That is the same shape as the two above: each copy was correct when
// written, and they drifted anyway (the error bodies still differ, which is
// why conflict() takes the message as a parameter).
//
// A fifth hand-rolled comparison would pass every behavioural test on the day
// it lands. This is what stops it.
describe("the If-Match precondition", () => {
  it("is compared in one place rather than inline in a route", () => {
    const offenders = [...workerFiles()]
      .filter(([name]) => name !== "worker/if-match.ts")
      .filter(([, text]) => /ifMatch\s*!==|!==\s*ifMatch/.test(text))
      .map(([name]) => name);
    expect(
      offenders,
      "these compare an If-Match header inline instead of calling stale() from worker/if-match.ts",
    ).toEqual([]);
  });
});
