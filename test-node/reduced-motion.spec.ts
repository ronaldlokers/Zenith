import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A component that moves geometry on hover has to say what it does when the
// reader has asked for less motion. Colour and shadow transitions are exempt
// on purpose — App.css's own reduced-motion block says so in as many words:
// they carry feedback without moving anything, and a blanket kill takes that
// with them.
//
// This exists because DashCard shipped the lift without the answer while its
// twin StatCard had it, and nothing caught it: the clickable variant is not
// rendered by any caller today, so no page-level sweep could see it. The
// component ships in Storybook regardless, and the first caller to pass
// onClick would have reintroduced the movement silently.
const DIR = new URL("../src/components/", import.meta.url).pathname;

function rules(css: string): { selector: string; body: string }[] {
  // Strip comments first — several of these files discuss `transform:` at
  // length in prose, and a naive scan reads those as declarations.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

describe("reduced motion", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".css"));

  it("covers every owned component that transitions transform", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const css = readFileSync(path.join(DIR, f), "utf8");
      const movesGeometry = rules(css).some(
        (r) =>
          /transition:[^;]*\btransform\b/.test(r.body) ||
          /transition-property:[^;]*\btransform\b/.test(r.body),
      );
      if (!movesGeometry) continue;
      if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css))
        offenders.push(f);
    }
    expect(
      offenders,
      "these transition transform with no reduced-motion answer",
    ).toEqual([]);
  });

  it("neutralizes the movement rather than the whole transition", () => {
    // Killing the shadow too would leave the hover with nothing to say. The
    // established shape — StatCard, then DashCard — narrows the transition to
    // box-shadow and sets transform: none.
    for (const f of ["StatCard.css", "DashCard.css"]) {
      const css = readFileSync(path.join(DIR, f), "utf8");
      const block = css.slice(
        css.indexOf("@media (prefers-reduced-motion: reduce)"),
      );
      expect(block, `${f} should still transition shadow`).toMatch(
        /transition:\s*box-shadow/,
      );
      expect(block, `${f} should stop the lift`).toMatch(/transform:\s*none/);
    }
  });
});
