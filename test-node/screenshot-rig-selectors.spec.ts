import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/screenshot-baseline.mjs clicked `.top-add` for who knows how long
// after the top-bar quick-add button that class belonged to was removed —
// the class survived only in a stray Button.tsx comment — and nobody found
// out until the rig hard-failed at capture 3 of 52. That is the general
// defect: the rig references a control that no longer exists, and the only
// way to learn that is to run all 52 captures and watch it die partway
// through. This guard catches it without a capture run.
//
// Name-level only, not a render: this proves the *class name* still appears
// somewhere in src/, not that the rig's selector actually resolves to a
// clickable element in the DOM the rig will see at click time (wrong
// element, changed nesting, a class present but never applied to the node
// the selector's ancestor chain expects). A real capture run is still the
// only thing that catches those.
const RIG = new URL("../scripts/screenshot-baseline.mjs", import.meta.url).pathname;
const SRC = new URL("../src", import.meta.url).pathname;

function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(p));
    else out.push(p);
  }
  return out;
}

// Whole-line comments only, same approach as no-emoji-icons.spec.ts: this is
// exactly what caught `.top-add` surviving as a stray comment in Button.tsx
// (recorded there as "e.g. .top-add's" while explaining an unrelated layout
// rule) — a plain substring search over raw file text passes that class as
// present when the class itself is long gone, which is the vacuous-pass this
// guard exists to avoid.
function stripCommentLines(text: string): string {
  let inBlock = false;
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      const wasInBlock = inBlock;
      if (trimmed.includes("/*")) inBlock = true;
      if (trimmed.includes("*/")) inBlock = false;
      if (wasInBlock || inBlock) return false;
      return !(trimmed.startsWith("//") || trimmed.startsWith("*"));
    })
    .join("\n");
}

const SOURCE = sourceFiles()
  .map((f) => stripCommentLines(readFileSync(f, "utf8")))
  .join("\n");

// Pull every `click:` value out of VIEWS — a single selector string, or an
// array of them for a multi-step interaction (the contact-then-templates
// sequence in the people view).
function clickSelectors(): string[] {
  const rig = readFileSync(RIG, "utf8");
  const values = [...rig.matchAll(/click:\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/g)].map(
    (m) => m[1],
  );
  const selectors: string[] = [];
  for (const v of values) {
    for (const m of v.matchAll(/"([^"]+)"|'([^']+)'/g)) selectors.push((m[1] ?? m[2])!);
  }
  return selectors;
}

// The class-name parts of a selector — ".zui-segmented button:nth-child(2)"
// yields "zui-segmented". IDs and tag/pseudo parts are not checked: the
// reported defect was a dead class, and a class is what a component swap or
// CSS rename actually deletes out from under a selector.
function classNames(selector: string): string[] {
  return [...selector.matchAll(/\.([-\w]+)/g)].map((m) => m[1]!);
}

describe("screenshot rig interaction selectors", () => {
  const selectors = clickSelectors();

  it("parsed a non-trivial number of interaction selectors", () => {
    // A regex that silently matches nothing would make the next assertion
    // pass vacuously. VIEWS carries well over a dozen individual selectors
    // today; pin a floor well below that so a genuine trim doesn't fail this
    // for the wrong reason, while a broken parse (matching zero) still does.
    expect(selectors.length).toBeGreaterThan(5);
  });

  it("names a class that still exists somewhere in src/", () => {
    const dead = selectors
      .flatMap((sel) => classNames(sel).map((cls) => ({ sel, cls })))
      .filter(({ cls }) => !SOURCE.includes(cls));
    expect(
      dead,
      "these interaction selectors name a class absent from src/ — the rig " +
        "will hard-fail on them the next time someone runs it",
    ).toEqual([]);
  });
});
