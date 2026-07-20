import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// The design-system bundle under .claude/ is design-sync managed and is
// overwritten wholesale by a pull. Importing it from src/ would turn a
// routine design sync into an unreviewed production change.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    // Dangling symlinks and permission-denied entries throw on statSync;
    // treat them as non-matches rather than aborting the whole walk.
    try {
      return statSync(full).isDirectory() ? walk(full) : [full];
    } catch {
      return [];
    }
  });
}

// Matches every import form that can reach .claude/: static
// `import ... from "..."` / `export ... from "..."`, side-effect
// `import "...";` (no `from` — this is how the design bundle's own CSS
// entry point is meant to be consumed, see .storybook/preview.jsx),
// dynamic `import("...")`, and CommonJS `require("...")`.
const CLAUDE_IMPORT_RE =
  /(?:\bfrom\s+["'][^"']*\.claude|\bimport\s*\(\s*["'][^"']*\.claude|\bimport\s+["'][^"']*\.claude|\brequire\s*\(\s*["'][^"']*\.claude)/;

export function importsFromClaude(source: string): boolean {
  return CLAUDE_IMPORT_RE.test(source);
}

// The stated rule is "any file under src/", not just TS — the design bundle
// itself ships .jsx, so an un-converted copy would slip past a TS-only scan.
const SCANNABLE_FILE_RE = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/;

test("no file under src/ imports from .claude/", () => {
  const offenders = walk("src")
    .filter((f) => SCANNABLE_FILE_RE.test(f))
    .filter((f) => importsFromClaude(readFileSync(f, "utf8")));
  expect(offenders).toEqual([]);
});

describe("importsFromClaude", () => {
  test("detects static from-imports", () => {
    expect(
      importsFromClaude(
        'import { Button } from "../.claude/skills/zenith-design/Button";',
      ),
    ).toBe(true);
  });

  test("detects side-effect imports (no `from`)", () => {
    expect(
      importsFromClaude('import "../.claude/skills/zenith-design/styles.css";'),
    ).toBe(true);
  });

  test("detects dynamic imports", () => {
    expect(
      importsFromClaude(
        'const m = await import(".claude/skills/zenith-design/Button");',
      ),
    ).toBe(true);
  });

  test("detects require()", () => {
    expect(
      importsFromClaude(
        'const styles = require(".claude/skills/zenith-design/styles.css");',
      ),
    ).toBe(true);
  });

  test("does not flag unrelated imports", () => {
    expect(importsFromClaude('import { useState } from "react";')).toBe(
      false,
    );
  });
});
