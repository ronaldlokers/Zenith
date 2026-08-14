import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The PUT routes write every column from the body, so a caller that spreads a
// record it loaded earlier puts back stale copies of every field it never
// showed. Four panels did exactly that. The cover-letter one:
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

/** The arguments, split on top-level commas only. */
function topLevelArgs(args: string): string[] {
  if (!args.trim()) return [];
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of args) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

describe("whole-object saves", () => {
  it("never spread a record that was loaded earlier", () => {
    // The rule, stated once for every resource. A form passing its own fields
    // (`data`) is a whole-object write by definition and is fine — the person
    // just saw all of them. Spreading a record the panel is *holding* is the
    // defect: it writes columns the panel never showed, from whenever it
    // loaded.
    //
    // Exempt when a version is passed, because then the route refuses a stale
    // write instead of silently applying it.
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\.update(?:<[^>]*>)?\s*\(/g)) {
        const open = m.index! + m[0].length - 1;
        const args = argsOf(text, open);
        const parts = topLevelArgs(args);
        if (parts.length >= 4) continue; // carries a precondition
        const payload = parts[2] ?? "";
        if (/^\s*\{\s*\.\.\./.test(payload)) {
          offenders.push(
            `${file.slice(SRC.length + 1)}: ${args.replace(/\s+/g, " ").slice(0, 70)}`,
          );
        }
      }
    }
    expect(
      offenders,
      "a loaded record spread into a route that writes every column — it will silently revert fields changed elsewhere",
    ).toEqual([]);
  });

  it("still finds the calls it is looking for", () => {
    // The guard passes trivially if the pattern stops matching — a rename, a
    // helper, a reformat. This fails when there is nothing left to check, so
    // it cannot go quiet without saying so.
    const calls = sources(SRC).reduce(
      (n, f) => n + [...readFileSync(f, "utf8").matchAll(/\.update(?:<[^>]*>)?\s*\(/g)].length,
      0,
    );
    expect(calls, "no whole-object save is being checked any more").toBeGreaterThan(0);
  });
});
