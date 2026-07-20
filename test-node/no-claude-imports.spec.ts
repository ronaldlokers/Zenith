import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

// The design-system bundle under .claude/ is design-sync managed and is
// overwritten wholesale by a pull. Importing it from src/ would turn a
// routine design sync into an unreviewed production change.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test("no file under src/ imports from .claude/", () => {
  const offenders = walk("src")
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => /from\s+["'][^"']*\.claude/.test(readFileSync(f, "utf8")));
  expect(offenders).toEqual([]);
});
