import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// README's "Project layout" block is an orientation map for someone reading
// the repo for the first time. It had drifted: it named network.tsx (since
// split into companies/contacts), settings.tsx (since a folder), and
// stats-view/chrome, which never existed under those names. A newcomer using
// it as a map searches for files that are not there.
//
// It has since been corrected, so this is not a fix — it is the thing that
// keeps it correct. Every other doc claim in this repo that could rot has a
// guard (doc-truth, api-reference-truth, backup-retention); a map of the
// filesystem is the cheapest of all to check, because the filesystem is right
// there.
const ROOT = new URL("..", import.meta.url).pathname;
const README = readFileSync(join(ROOT, "README.md"), "utf8");

/** The paths the layout block claims exist, resolved against the repo. */
function claimedPaths(): string[] {
  const section = README.slice(README.indexOf("## Project layout"));
  const block = section.slice(section.indexOf("```") + 3, section.indexOf("```", section.indexOf("```") + 3));
  const paths: string[] = [];
  let base = "";
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    // A top-level entry starts at column 0 and names a directory; everything
    // indented under it is relative to that.
    const [column] = line.trim().split(/\s{2,}/);
    const isTopLevel = !/^\s/.test(line);
    if (isTopLevel) {
      base = column.endsWith("/") ? column : "";
      paths.push(column.replace(/\/$/, ""));
      continue;
    }
    // Feature lists are separated by "·" — "dashboard·board·detail".
    for (const token of column.split("·").map((t) => t.trim())) {
      if (!token || token.includes(" ")) continue;
      paths.push(base + token);
    }
  }
  return paths;
}

/** src/foo may be foo.ts, foo.tsx, or a folder. */
const resolves = (p: string): boolean => {
  const clean = p.replace(/\/$/, "");
  return [clean, `${clean}.ts`, `${clean}.tsx`, `${clean}.css`].some((c) =>
    existsSync(join(ROOT, c)),
  );
};

describe("the README's project layout", () => {
  it("names only things that exist", () => {
    const missing = claimedPaths().filter((p) => !resolves(p));
    expect(
      missing,
      "the layout map sends a first-time reader looking for files that are not there",
    ).toEqual([]);
  });

  it("is actually reading the block", () => {
    // Without this, a heading rename or a fence change makes the test above
    // pass on an empty list — the failure mode every guard in this repo has
    // had to learn.
    const paths = claimedPaths();
    expect(paths.length, "no paths parsed out of the layout block").toBeGreaterThan(15);
    expect(paths).toContain("src/App.tsx");
    expect(paths).toContain("worker/feed.ts");
  });
});
