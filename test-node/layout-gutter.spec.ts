// The page gutter is one number in one place. Two rules depend on it and
// have to stay in agreement: .app pads content in from the viewport edge,
// and .top breaks back out by exactly the same amount so the bar is
// full-bleed on mobile. A literal in either would keep working today and
// silently stop cancelling the moment the gutter changes — which the
// Fizzy-philosophy shell is about to do (PR 3).
//
// Reads the stylesheets directly, so this fails here rather than as a 12px
// sliver down one edge of a phone.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDEX = readFileSync(join(__dirname, "../src/index.css"), "utf8");
const APP = readFileSync(join(__dirname, "../src/App.css"), "utf8");

describe("page gutter", () => {
  it("is defined once, on :root", () => {
    const decl = INDEX.match(/--gutter:\s*([^;]+);/);
    expect(decl, "--gutter is declared in src/index.css").toBeTruthy();
    expect(decl![1].trim()).toBe("var(--space-3)");
    expect(
      INDEX.match(/--gutter:/g)!.length,
      "--gutter declared exactly once",
    ).toBe(1);
  });

  it("is what the app shell pads with", () => {
    const rule = APP.match(/\.app \{[^}]*\}/)!;
    expect(rule[0]).toContain("padding: 0 var(--gutter)");
  });

  it("is what the full-bleed top bar breaks out by", () => {
    // Must be the negated token, not a repeated literal.
    expect(APP).toContain("margin: 0 calc(var(--gutter) * -1);");
  });
});
