import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Every destructive action in the app either asks first (requestConfirm) or
// offers an undo (deleteWithUndo / useDeleteWithUndo). Three did neither, and
// they were found by sweeping rather than by use: deleting a CV entry, an
// outreach template, and a saved view.
//
// The saved view was the worst of them — its × sits inside the same chip as
// the button that applies the view, so the likeliest mis-tap on the board was
// also the only unguarded destructive control on it.
//
// This is a source check because the question is about a call site, not a
// rendered state: does *this* delete have something in front of it. A
// rendered test would need every one of these screens in every state.
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

/**
 * The enclosing function body for a match, by brace balance.
 *
 * Walks back through every preceding `=> {` and keeps the first whose braces
 * actually close after the match. The obvious version — take the nearest one
 * — returns a function that ended before the match, and then reports whatever
 * that unrelated function does. It cost a false offender here.
 */
function enclosingBody(text: string, at: number): string {
  let from = at;
  for (;;) {
    const start = text.lastIndexOf("=> {", from);
    if (start === -1) break;
    let depth = 0;
    for (let i = start + 3; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          if (i > at) return text.slice(start, i + 1);
          break;
        }
      }
    }
    from = start - 1;
    if (from < 0) break;
  }
  return text.slice(Math.max(0, at - 400), at + 400);
}

// Deletes that are deliberately immediate, with the reason. The line drawn,
// after looking at all of them: authored or recorded content asks first, a
// list entry that can be retyped from memory in seconds does not.
//
// A keyword, a blocklist entry and "Dutch — native" are all re-added in less
// time than a dialog takes to read. Friction spent where it is not needed is
// what teaches people to dismiss the dialogs that matter, which is the same
// argument the account-deletion flow makes from the other side.
const DELIBERATELY_IMMEDIATE = [
  "deleteFeedKeyword",
  "deleteBlocklist",
  'remove("languages"',
];

const DESTRUCTIVE = /\.(remove|deleteSavedView|deleteRoleType|deleteAtsBoard|removeDocument|deleteWebhook)\(/;

describe("destructive actions", () => {
  it("ask first or offer an undo", () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      if (file.endsWith("delete-with-undo.ts") || file.endsWith("app-data.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(new RegExp(DESTRUCTIVE, "g"))) {
        const body = enclosingBody(text, m.index!);
        if (DELIBERATELY_IMMEDIATE.some((n) => body.includes(n))) continue;
        // The undo path is excluded by file above, and its own call site
        // reads `remove(id, name)` with no dot, so it never matches here.
        // Everything that does match must ask first.
        if (!body.includes("requestConfirm")) {
          offenders.push(`${file.slice(SRC.length + 1)}: ${m[0]}`);
        }
      }
    }
    expect(
      offenders,
      "a destructive action with neither a confirmation nor an undo in front of it",
    ).toEqual([]);
  });

  it("still finds the calls it is checking", () => {
    // Fails when the pattern stops matching, so the guard cannot go quiet
    // after a rename.
    const calls = sources(SRC).reduce(
      (n, f) => n + [...readFileSync(f, "utf8").matchAll(new RegExp(DESTRUCTIVE, "g"))].length,
      0,
    );
    expect(calls, "no destructive call is being checked any more").toBeGreaterThan(3);
  });
});
