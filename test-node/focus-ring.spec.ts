import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// index.css:338 moved the focus ring from --accent to --accent-ink, with the
// measurements in its own comment: the gold ring is 2.27:1 on a white card and
// 2.03:1 on the paper ground, where WCAG 1.4.11 asks for 3:1.
//
// App.css then set it back to --accent for [role="button"], and won — App.css
// is @layer app against index.css's @layer reset, and the attribute selector
// outranks the bare pseudo-class either way. Every element carrying the role
// drew the ring the fix had removed: 28 of them across the app, including the
// board's cards and every company and person row. Measured on a focused row
// before the fix, rgb(214,164,65) on the paper ground: 2.03:1, the same figure
// the comment cites.
//
// A source check rather than a rendered one because that is where the mistake
// is legible — the rule looked local and correct, and only the cascade made it
// wrong.
const INDEX = readFileSync(join(__dirname, "../src/index.css"), "utf8");
const APP = readFileSync(join(__dirname, "../src/App.css"), "utf8");

/** Strips comments so a colour named while explaining it is not a match. */
const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const MIN_NON_TEXT_CONTRAST = 3;

type RGB = [number, number, number];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const relLuminance = ([r, g, b]: RGB) =>
  0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

function contrast(a: RGB, b: RGB): number {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function token(name: string): string {
  const m = INDEX.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  expect(m, `--${name} is not defined in index.css`).toBeTruthy();
  return m![1];
}

/** Every rule body whose selector mentions :focus-visible. */
function focusRules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const m of code(css).matchAll(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g)) {
    out.push({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] });
  }
  return out;
}

describe("focus ring", () => {
  it("clears 1.4.11 against the ground it is drawn on", () => {
    // outline-offset puts the ring outside the element, so what sits behind it
    // is the page, not the card it belongs to.
    const ring = hex(token("accent-ink"));
    const paper = hex(token("bg"));
    expect(
      contrast(ring, paper),
      "the focus ring does not stand out from the page it is drawn on",
    ).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
  });

  it("is never repainted with the under-contrasted accent", () => {
    // The whole failure was one rule reintroducing --accent for a subset of
    // elements. Any rule doing that again fails here, wherever it lives.
    const offenders = [...focusRules(INDEX), ...focusRules(APP)].filter((r) =>
      /outline[^;]*var\(--accent\)/.test(r.body),
    );
    expect(
      offenders.map((o) => o.selector),
      "a :focus-visible rule sets the ring to --accent, which measures 2.03:1 on the paper ground",
    ).toEqual([]);
  });

  it("still gives every focusable element a ring to fail or pass", () => {
    // Guards the other direction: deleting the override was the fix, and
    // deleting the base rule with it would leave no ring at all.
    const base = focusRules(INDEX).find((r) => r.selector === ":focus-visible");
    expect(base, "index.css no longer defines a base focus ring").toBeTruthy();
    expect(base!.body).toMatch(/outline:[^;]*var\(--accent-ink\)/);
  });
});
