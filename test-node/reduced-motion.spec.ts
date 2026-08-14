import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Every animation in the app is disabled under prefers-reduced-motion today —
// checked, and it is not an accident: the comment beside the last of them
// calls the disclosure marker "the last thing here that actually moves".
//
// Nothing keeps it that way. An animation added tomorrow is unguarded, and
// the failure is silent for everyone who does not set the preference — which
// is nearly everyone writing the code. That is the same shape as the focus
// ring fixed in one stylesheet and reintroduced in two others, and the row
// activation fixed on one component and left on four.
const SRC = new URL("../src", import.meta.url).pathname;

function stylesheets(dir = SRC): { path: string; css: string }[] {
  const out: { path: string; css: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...stylesheets(p));
    else if (entry.name.endsWith(".css"))
      out.push({ path: p.slice(SRC.length + 1), css: readFileSync(p, "utf8") });
  }
  return out;
}

const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Selectors that start an animation, and selectors that stop one. */
function animationSelectors(css: string) {
  const declares = new Set<string>();
  const disables = new Set<string>();
  // Rule bodies, with the selector that opens them.
  for (const m of code(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    const body = m[2];
    if (!/(^|[\s;])animation:/.test(body)) continue;
    const stops = /animation:\s*none/.test(body);
    // Split a grouped selector so "a, b { animation: none }" covers both.
    for (const one of selector.split(",").map((x) => x.trim()).filter(Boolean)) {
      if (one.startsWith("@")) continue;
      (stops ? disables : declares).add(one);
    }
  }
  return { declares, disables };
}

describe("motion", () => {
  it("can be turned off everywhere it is turned on", () => {
    const declares = new Set<string>();
    const disables = new Set<string>();
    for (const { css } of stylesheets()) {
      const found = animationSelectors(css);
      found.declares.forEach((s) => declares.add(s));
      found.disables.forEach((s) => disables.add(s));
    }

    const unguarded = [...declares].filter((selector) => {
      // A selector counts as guarded when something that disables animation
      // names it, or names a prefix of it — ".modal-backdrop" covers
      // ".modal-backdrop > .modal" only if that is written out, which it is.
      return ![...disables].some(
        (off) => off === selector || selector.startsWith(off),
      );
    });

    expect(
      unguarded,
      "an animation with no prefers-reduced-motion counterpart — silent for everyone who does not set the preference",
    ).toEqual([]);
  });

  it("still has the preference honoured at all", () => {
    // Guards the other direction: the check above passes trivially if every
    // reduced-motion block were deleted along with the animations.
    const guarded = stylesheets().filter(({ css }) =>
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css),
    );
    expect(guarded.length).toBeGreaterThanOrEqual(4);
  });
});
