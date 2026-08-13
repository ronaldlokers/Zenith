import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// .sr-only is position: absolute. That is what makes it invisible without
// leaving the accessibility tree — and it is also a trap, because an
// absolutely positioned element is only clipped by an ancestor scroller if
// that scroller is in its containing-block chain.
//
// The board's narrow carousel learned this the expensive way. Each column
// got an sr-only stage heading so the phone outline would not skip h1 to
// h3; every ancestor up to the viewport was static, so the headings'
// containing block was the initial one, and the carousel's overflow-x never
// clipped them. Each heading sat at its column's document x — the last at
// 2176px — and dragged the document's scroll width out with it. The whole
// page scrolled sideways at every phone width, which is the two-dimensional
// scrolling WCAG 1.4.10 exists to forbid, on the app's main screen.
//
// Measured rather than reasoned: hiding the nine headings took
// documentElement.scrollWidth from 2179 to 320.
//
// The fix is one line and invisible, which is exactly why it needs a test —
// nothing about the rendered board says it is load-bearing.
const css = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
const utilities = readFileSync(
  new URL("../src/utilities.css", import.meta.url),
  "utf8",
);

describe("sr-only containment on the board carousel", () => {
  it("still relies on absolute positioning, which is the premise", () => {
    // If .sr-only ever stops being absolute this whole hazard disappears
    // and the rule below becomes dead weight. Assert the premise so the
    // test tells the truth about why it exists.
    const rule = utilities.slice(utilities.indexOf(".sr-only"));
    expect(rule.slice(0, 200)).toMatch(/position:\s*absolute/);
  });

  it("gives the carousel column a containing block", () => {
    // The narrow block — the one that also renders the heading sr-only.
    const at = css.indexOf(".board > .bcol {");
    expect(at, ".board > .bcol rule went missing").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(
      rule,
      "without position on the column the sr-only heading escapes the " +
        "carousel and the page scrolls in two dimensions",
    ).toMatch(/position:\s*relative/);
  });

  it("keeps the scroller it is being clipped by", () => {
    // The other half of the pair: relative on the column only helps while
    // .board is the thing doing the clipping. The carousel's overflow is
    // declared in the same narrow block as the column rule — not on the
    // base .board, which is a grid — so this looks in that block rather
    // than at the first .board it can find.
    const columnAt = css.indexOf(".board > .bcol {");
    const block = css.slice(Math.max(0, columnAt - 2000), columnAt);
    const boardAt = block.lastIndexOf(".board {");
    expect(boardAt, "no .board rule precedes the column rule").toBeGreaterThan(-1);
    const rule = block.slice(boardAt, block.indexOf("}", boardAt));
    expect(rule).toMatch(/overflow-x:\s*auto/);
  });
});
