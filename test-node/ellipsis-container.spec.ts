import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// text-overflow has no effect on a flex or grid container: the text inside one
// is an anonymous flex/grid item, and the property only applies to a block
// container's own inline content. A rule that sets both therefore reads as
// "this truncates with an ellipsis" and silently does not.
//
// Both identity strips in the app had exactly that shape, and both clipped
// company names mid-word with no ellipsis for as long as they had existed —
// .bstrip > span on every board card, .feed-strip > span on every feed row.
// The board one was raised independently by five reviewers, which is what a
// defect on the primary daily-scan surface looks like.
//
// The property is the wrong thing to grep for on its own; the pairing is the
// bug, and the pairing is what this guards.
const ROOT = new URL("..", import.meta.url).pathname;
const CONTAINER_DISPLAYS = ["flex", "inline-flex", "grid", "inline-grid"];

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

describe("text-overflow: ellipsis", () => {
  it("is never declared on a flex or grid container, where it does nothing", () => {
    const offenders: string[] = [];
    for (const file of cssFiles(join(ROOT, "src"))) {
      const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      // Flat rule blocks only. These stylesheets do not nest, and a nesting
      // parser would be more machinery than the check is worth.
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = match[2];
        if (!/text-overflow:\s*ellipsis/.test(body)) continue;
        const display = body.match(/display:\s*([\w-]+)/)?.[1];
        if (!display || !CONTAINER_DISPLAYS.includes(display)) continue;
        const selector = match[1].trim().split("\n").pop()!.trim();
        offenders.push(`${file.slice(ROOT.length)}: ${selector} (display: ${display})`);
      }
    }
    expect(
      offenders,
      "these rules promise an ellipsis the browser will never draw — move the truncation onto a block child",
    ).toEqual([]);
  });
});
