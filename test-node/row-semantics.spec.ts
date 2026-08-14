import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// rowActivate returns role="button" and tabIndex, and it used to be spread
// straight onto <Row>, which renders an <li>. role="button" overrides the
// li's implicit listitem, so the <ul> around them reported a list containing
// no items: measured with axe on the company and person lists, which is the
// count and the "3 of 12" position a screen reader gives on every row.
//
// The fix is structural and easy to undo by accident, because spreading the
// activation onto the Row is the shorter thing to write and looks right.
// https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/listitem_role
const SRC = join(__dirname, "../src");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.tsx$/.test(entry.name) && !/\.(test|stories)\.tsx$/.test(entry.name))
      out.push(path);
  }
  return out;
}

describe("list rows keep their listitem semantics", () => {
  it("never puts the activation on a list item", () => {
    // <Row> and a bare <li> both, because the first version of this checked
    // only <Row> — and NotificationBell spreads rowActivate onto its own <li>,
    // so the same defect was sitting in the notification panel the whole time
    // this test was passing.
    //
    // Matches up to the closing bracket of the opening tag, so activation on
    // a child element does not trip it.
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/<(Row|li)\b[^>]*>/g)) {
        if (m[0].includes("rowActivate")) {
          offenders.push(`${file.slice(SRC.length + 1)}: ${m[0].replace(/\s+/g, " ").slice(0, 60)}`);
        }
      }
    }
    expect(
      offenders,
      "role=\"button\" on the <li> overrides listitem and empties the list it sits in",
    ).toEqual([]);
  });

  it("keeps the focus ring on the row rather than the inner target", () => {
    // .zui-row clips its own overflow, so an outline drawn on the child that
    // now holds the role is cut off at the row's edge. Row.css puts it back on
    // the row with :has(). Losing either half loses the ring.
    const css = readFileSync(join(SRC, "components/Row.css"), "utf8");
    expect(css).toMatch(/\.zui-row:has\(>\s*\.zui-rowbtn:focus-visible\)/);
    expect(css).toMatch(/\.zui-row\s*>\s*\.zui-rowbtn:focus-visible\s*\{[^}]*outline:\s*none/);
  });
});
