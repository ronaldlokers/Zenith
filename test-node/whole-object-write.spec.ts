import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// PUT /api/applications/:id writes every column from the body, so a caller
// that spreads an application it loaded earlier puts back stale copies of
// every field it never showed. The cover-letter panel did exactly that:
// { ...application, cover_letter }, from a snapshot taken when the detail
// page loaded. Measured — a note and a fit score typed elsewhere both
// reverted to null by a save the person thought touched one field.
//
// The route already refuses a stale write when the caller sends If-Match, and
// api.update takes that as its fourth argument. So the rule is: whole-object
// writes carry a precondition. A caller that cannot supply one is writing
// through the wrong route and wants PATCH.
//
// Written as the rule and not as "CoverLetterSection must not call update",
// which is the shape of the one bug that has already been fixed and would
// pass for every future caller that repeats it.
const SRC = join(__dirname, "../src");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name))
      out.push(p);
  }
  return out;
}

/** The argument list of a call, from the open paren, balanced. */
function argsOf(text: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return text.slice(openParen + 1, i);
    }
  }
  return "";
}

/** Top-level comma count + 1, ignoring commas inside nested brackets. */
function argCount(args: string): number {
  if (!args.trim()) return 0;
  let depth = 0;
  let n = 1;
  for (const ch of args) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) n++;
  }
  return n;
}

describe("whole-object application saves", () => {
  it("always carry the version they were loaded at", () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, "utf8");
      // .update("applications", … — the PUT that writes every column.
      for (const m of text.matchAll(/\.update(?:<[^>]*>)?\s*\(\s*"applications"/g)) {
        const open = text.indexOf("(", m.index! + ".update".length);
        const args = argsOf(text, open);
        if (argCount(args) < 4) {
          offenders.push(
            `${file.slice(SRC.length + 1)}: ${args.replace(/\s+/g, " ").slice(0, 70)}`,
          );
        }
      }
    }
    expect(
      offenders,
      "a whole-object application save with no If-Match — it will silently revert fields changed elsewhere",
    ).toEqual([]);
  });

  it("still finds the call it is looking for", () => {
    // The guard above passes trivially if the pattern stops matching — a
    // rename, a helper, a reformat. This fails when there is nothing left to
    // check, so the guard cannot go quiet without saying so.
    const found = sources(SRC).some((f) =>
      /\.update(?:<[^>]*>)?\s*\(\s*"applications"/.test(readFileSync(f, "utf8")),
    );
    expect(found, "no whole-object application save is being checked any more").toBe(true);
  });
});
