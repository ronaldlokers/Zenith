import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// App.css is one file held in order by comments. The order is the only thing
// making its cascade predictable — band 4 normalizes controls and has to sit
// after everything it normalizes; band 5 repairs what band 4 broke and has to
// sit after that; print comes last. Nothing checked the markers were still
// in that order, and they are ordinary comments: a merge can reorder them,
// and a large edit can drop one, with no error either way.
//
// This pins the sequence, not the contents. The contents have already
// drifted — see the note in the file's own header — and re-banding a
// stylesheet that was verified with computed-style probes is a deliberate
// piece of work, not a tidy-up.
const CSS = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

const MARKERS = [
  "Band order",
  "Control normalization layer",
  "Cascade repairs",
  "@media print",
];

describe("App.css bands", () => {
  it("keeps its markers in the documented order", () => {
    const positions = MARKERS.map((m) => {
      const at = CSS.indexOf(m);
      expect(at, `band marker missing: ${m}`).toBeGreaterThan(-1);
      return at;
    });
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions, `bands are out of order: ${MARKERS.join(" → ")}`).toEqual(
      sorted,
    );
  });

  it("has print last, so nothing lands after it by accident", () => {
    // Anything appended to the file after the print band applies on paper
    // too, which is a surprising place for a screen rule to end up.
    const printAt = CSS.indexOf("@media print");
    const tail = CSS.slice(printAt);
    const braces = [...tail].reduce((d, ch) => d + (ch === "{" ? 1 : ch === "}" ? -1 : 0), 0);
    expect(braces, "the print band is unbalanced or something follows it").toBe(0);
  });
});
