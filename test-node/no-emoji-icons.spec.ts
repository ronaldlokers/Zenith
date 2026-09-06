import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// "Icons are line-art SVGs in the app's own style (24x24, currentColor,
// strokeWidth 2) — not emoji" is a locked rule in CLAUDE.md. The other locked
// visual rules have specs: stage hues in stage-palette.spec.ts, light-only in
// locked-decisions.spec.ts. This one was enforceable by a reviewer noticing,
// and there is no reviewer but the author.
//
// Emoji presentation, not "any character outside ASCII". The product is
// bilingual and the copy is full of accented Dutch; a rule that failed on
// "sollicitatie" would be turned off within a week. The property this matches
// is the one that makes a glyph render as a colour picture rather than text.
const ROOT = new URL("..", import.meta.url).pathname;

// U+FE0F is the variation selector that forces emoji presentation on an
// otherwise text-default character, so it counts too — "★️" is an emoji
// where a bare "★" is a glyph the CSS can colour.
const EMOJI = /\p{Extended_Pictographic}️?|️/u;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.(test|stories)\.tsx?$/.test(entry)) {
      // Tests and stories are allowed them: a spec asserting the rule has to
      // be able to write one down, which is what this very file does.
      out.push(full);
    }
  }
  return out;
}

describe("icons", () => {
  it("are drawn, not typed", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      let inBlock = false;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          // Comments are out of scope: the rule is about what renders, and the
          // first run of this flagged two comments in icons.tsx that exist to
          // record which emoji were *removed*. A guard that fails on its own
          // changelog teaches people to delete the note.
          //
          // Whole-line comments only. A trailing `// 📊` on a code line would
          // still be flagged, which is the safe direction to be wrong in —
          // stripping from the first `//` would swallow anything after a URL.
          const trimmed = line.trim();
          const wasInBlock = inBlock;
          if (trimmed.includes("/*")) inBlock = true;
          if (trimmed.includes("*/")) inBlock = false;
          if (wasInBlock || inBlock) return;
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

          const hit = line.match(EMOJI);
          if (hit) offenders.push(`${file.slice(ROOT.length)}:${i + 1} ${hit[0]}`);
        });
    }
    expect(
      offenders,
      "CLAUDE.md locks icons to line-art SVGs; these are emoji",
    ).toEqual([]);
  });

  it("is looking at the files it thinks it is", () => {
    // A pattern that stops matching, or a walk that finds nothing, would make
    // the assertion above pass on an empty list forever.
    const files = sourceFiles(join(ROOT, "src"));
    expect(files.length, "no source files found — has src/ moved?").toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith("icons.tsx"))).toBe(true);
    expect(EMOJI.test("📊"), "the pattern does not match an emoji").toBe(true);
    expect(EMOJI.test("Sollicitatie — één"), "the pattern flags ordinary copy").toBe(false);
  });
});
