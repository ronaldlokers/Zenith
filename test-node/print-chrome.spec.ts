import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A `position: fixed` element does not scroll off a printed page — it repeats
// on every sheet. The bottom bar arrived with the Fizzy-philosophy shell,
// after the print block was written, and nothing brought the two together:
// rendering the CV to PDF put "NOTIFICATIONS" across the foot of all three
// pages of the one document a user sends to an employer.
//
// So the invariant is not "hide the bottom bar" — that is the instance. It is
// that anything which becomes fixed has to be dealt with in print, one way or
// another. This finds the fixed things and requires each to be accounted for.
const css = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");

function printBlock(): string {
  const at = bare.indexOf("@media print");
  expect(at, "the print block went missing").toBeGreaterThan(-1);
  let depth = 0;
  for (let i = at; i < bare.length; i++) {
    if (bare[i] === "{") depth++;
    else if (bare[i] === "}" && --depth === 0) return bare.slice(at, i + 1);
  }
  return "";
}

function fixedClasses(): string[] {
  const out = new Set<string>();
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/position:\s*fixed/.test(m[2])) continue;
    for (const sel of m[1].split(",")) {
      const last = sel.trim().split(/\s+/).pop() ?? "";
      const classes = last.match(/\.[a-zA-Z][\w-]*/g);
      if (classes) out.add(classes[classes.length - 1]);
    }
  }
  return [...out];
}

describe("print chrome", () => {
  it("accounts for every position: fixed element", () => {
    const block = printBlock();
    // "Accounted for" is deliberately loose: .modal-backdrop is handled by
    // being made static rather than hidden, which is the right answer for a
    // detail modal someone deliberately printed. Either counts; silence does
    // not.
    const unhandled = fixedClasses().filter((c) => !block.includes(c));
    expect(
      unhandled,
      "these are position: fixed and the print block never mentions them, " +
        "so they will repeat on every printed sheet",
    ).toEqual([]);
  });

  it("hides the bottom bar specifically", () => {
    // The instance that cost three pages of a printed CV.
    const block = printBlock();
    const hide = block.slice(0, block.indexOf("display: none !important"));
    expect(hide).toContain(".bottombar");
  });

  it("drops the bar's reserve when the bar is gone", () => {
    // --bottombar-reserve keeps the foot of every page clear of a bar that
    // print has just removed; left in, it prints as a band of white.
    expect(printBlock()).toMatch(/padding-bottom:\s*0\s*!important/);
  });
});
