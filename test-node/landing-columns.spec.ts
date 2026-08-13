import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The landing screen's column count is declared once. It used to be declared
// twice — a stale two-column rule sat later in the file and silently won on
// source order, so the third column wrapped under the first and "Happened
// today" fell below the fold it was moved onto this screen to stay above.
// Nothing in CI would have caught that, which is why it is pinned here.
const css = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

function blocksFor(selector: string): string[] {
  const out: string[] = [];
  // Matches "<selector> {" only where it is the whole selector, so
  // ".today-cols" does not also collect ".today-cols > *" rules.
  const re = new RegExp(`(^|\\n)\\s*${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push(m[2]);
  return out;
}

describe("landing screen columns", () => {
  it("declares its column count exactly once", () => {
    // Two tracks since the design audit, not three equal ones: the first
    // column is the task path and the other blocks are a rail of summaries.
    // Measured at 1440 on the demo set before the change — 767px of content
    // in column one against 195 and 64 — so a third of the screen did the
    // work while two thirds stood empty and every title wrapped.
    const declaring = blocksFor(".today-cols").filter((b) =>
      b.includes("grid-template-columns"),
    );
    expect(declaring).toHaveLength(1);
    expect(declaring[0]).toContain("1.6fr");
  });

  it("keeps the summaries in one rail rather than one row each", () => {
    // As separate grid items their rows were sized by the task column
    // beside them, which opened a gap between two blocks that belong
    // together.
    expect(css).toContain(".today-rail");
  });

  it("gives the landing a wider measure than the rest of .dash", () => {
    // Three columns of sentences at the 1000px measure came out 300px wide —
    // enough to lay out, not enough to read in. The rule carries two classes
    // so it beats `.app:has(.dash) .content` on specificity rather than on
    // being written after it.
    expect(css).toContain(".app:has(.dash.today) .content");
  });
});
