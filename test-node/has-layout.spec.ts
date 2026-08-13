import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `:has()` cannot match until the element it looks for exists. For a rule
// that decides layout, that means the page lays out one way and then jumps
// when the content mounts — and the jump is what a reader sees.
//
// This app learned it twice. `.app:has(.board)` and friends set the shell's
// max-width, so every released page laid out at the cap and then widened: a
// uniform ~0.22 shift at 1440. Converting those left a second set targeting
// .content, which was the one actually visible — .content went from x 340
// w 760 to x 12 w 1416 on the board, the whole of a 0.16 shift. Both are
// now keyed off `app-tab-${tab}`, which is on the root at first paint.
//
// So the rule is not "never use :has()". It is that a selector deciding
// where something sits must not depend on content that arrives later, and
// on this app the route already says everything those selectors were asking.
const ROOT = new URL("..", import.meta.url).pathname;

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

// Properties that move things. A :has() rule setting a colour is fine — the
// worst it does is repaint.
const LAYOUT = /(^|[\s;{])(max-width|min-width|width|max-height|height|display|grid-template|flex-direction|position|padding|margin|gap)\s*:/;

describe("layout must not wait for content", () => {
  it("has no :has() rule that decides layout", () => {
    const offenders: string[] = [];
    for (const file of cssFiles(join(ROOT, "src"))) {
      // Comments in this repo discuss :has() at length; strip them or every
      // explanation of the bug reads as an instance of it.
      const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/([^{}]*:has\([^{}]*)\{([^}]*)\}/g)) {
        if (LAYOUT.test(m[2])) {
          offenders.push(`${file.replace(ROOT, "")}: ${m[1].trim().slice(0, 60)}`);
        }
      }
    }
    expect(
      offenders,
      "these decide layout from content that has not arrived yet — key them " +
        "off the tab class, which is on the root at first paint",
    ).toEqual([]);
  });

  it("still keys the shell and the content column off the tab", () => {
    // The replacement, asserted so the fix is not quietly undone by deleting
    // rather than converting.
    const css = readFileSync(join(ROOT, "src/App.css"), "utf8");
    expect(css).toMatch(/\.app\.app-tab-board\b/);
    expect(css).toMatch(/\.app\.app-tab-board \.content/);
    // The routed application takes a narrower measure than the board list,
    // and its marker comes from the URL rather than the loaded row.
    expect(css).toMatch(/\.app\.app-detail \.content/);
  });
});
