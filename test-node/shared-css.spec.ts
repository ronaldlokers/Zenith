import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Two things this file guards, both of the same kind: a rule that has to
// exist in exactly one place, where writing a second copy would look right
// and quietly win or lose on order.
//
// Printing is the one output nobody looks at while building, and the shell
// broke it twice over: the plate printed as a slab of ink, and the blanket
// `button { display: none }` in the print band took the stage rail with it —
// so a printed application no longer said what stage it was in, which is the
// first thing anyone reads off one.
const APP = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
const CV = readFileSync(new URL("../src/cv/cv.css", import.meta.url), "utf8");

function printBand(css: string): string {
  const i = css.indexOf("@media print");
  expect(i, "no print band").toBeGreaterThan(-1);
  // Balance braces from the band's opening brace to find its extent.
  let depth = 0;
  for (let j = css.indexOf("{", i); j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}" && --depth === 0) return css.slice(i, j + 1);
  }
  throw new Error("unterminated print band");
}

describe("print band", () => {
  const band = printBand(APP);

  it("flattens the detail plate and drops what is only there to click", () => {
    expect(band).toContain(".detail-plate");
    expect(band).toContain(".detail-tools");
    expect(band).toContain(".detail-plate-actions");
  });

  it("prints the current stage, after the blanket button hide", () => {
    // Both rules carry !important, so the order decides. If the re-show ever
    // moves above the blanket hide, the stage silently drops off the page
    // again and nothing on screen changes.
    const hideAll = band.indexOf(".detail-rail button {");
    const showCurrent = band.indexOf(".detail-rail button.current");
    expect(hideAll, "blanket rail hide missing").toBeGreaterThan(-1);
    expect(showCurrent, "current-stage re-show missing").toBeGreaterThan(-1);
    expect(showCurrent).toBeGreaterThan(hideAll);
  });

  it("leaves the CV's own plate to the CV's own layer", () => {
    // App.css is @layer app and cv.css is @layer components: no specificity
    // in the print band can beat the component's background, so the rule has
    // to live beside the component. This caught a real miss.
    expect(band).not.toContain(".cv-plate");
    expect(printBand(CV)).toContain(".cv-plate");
  });
});

describe("ruled headings", () => {
  it("are one recipe, not a copy per screen", () => {
    // Settings, Insights and anything after them share the flanked-heading
    // treatment. Three copies of the same declarations is how the landing
    // screen ended up with two column counts, one of them stale.
    const heads = APP.match(/^\.ruled-h,\n\.settings-modal h2,\n\.settings-content h3 \{/m);
    expect(heads, "the ruled heading is declared somewhere else too").toBeTruthy();
    // The rules are pseudo-elements on the same selector list.
    expect(APP).toContain(".ruled-h::before,");
  });
});

describe("CV plate inset", () => {
  it("is one number, read by both files that need it", () => {
    // The tools hang in the margin either side of the plate, and the builder
    // below aligns to the plate's edges. That is the same measurement in two
    // stylesheets — cv.css sizes the tools, App.css insets the builder — so a
    // literal in either stops agreeing the moment the tools change size.
    expect(APP).toMatch(/--cv-tool:\s*\d+px/);
    expect(APP).toContain("calc(var(--cv-tool) + var(--cv-tool-gap))");
    expect(CV).toContain("width: var(--cv-tool)");
    // And the declaration lives in exactly one of them.
    expect(CV).not.toMatch(/--cv-tool:\s*\d/);
  });
});
