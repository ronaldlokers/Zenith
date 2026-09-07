import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A `uses: actions/checkout@v4` pin names a mutable major-version tag —
// whoever controls that action's repo can move it to any commit, and it runs
// with whatever secrets the job has (deploy.yml carries CLOUDFLARE_API_TOKEN).
// Pinning to a commit SHA closes that; `.github/dependabot.yml`'s
// github-actions ecosystem entry (see dependency-automation.spec.ts) is what
// keeps the pins from rotting, turning each bump into a reviewable diff
// instead of a silent retag.
//
// Reads the workflows directory rather than naming files, so a new workflow
// is covered without anyone remembering to add it here.
const ROOT = new URL("..", import.meta.url).pathname;
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");

const SHA_PIN = /^[0-9a-f]{40}$/;

describe("workflow actions are pinned to commit SHAs", () => {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

  it("found at least one workflow file to check", () => {
    expect(files.length, `no workflow files found under ${WORKFLOWS_DIR}`).toBeGreaterThan(0);
  });

  const usesByFile = files.map((file) => {
    const content = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    const refs = [...content.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
    return { file, refs };
  });

  it("finds a nonzero, plausible number of `uses:` references", () => {
    // Guards against the regex silently matching nothing (wrong indentation
    // assumption, a quoting style not accounted for) and the assertions below
    // passing vacuously over an empty list.
    const total = usesByFile.reduce((sum, { refs }) => sum + refs.length, 0);
    const filesWithRefs = usesByFile.filter(({ refs }) => refs.length > 0).length;
    expect(total, "no `uses:` references found across any workflow — has the format changed?").toBeGreaterThan(0);
    expect(filesWithRefs, "expected more than one workflow file to reference an action").toBeGreaterThan(0);
  });

  it("names the version each SHA stands for", () => {
    // The comment is what makes the pin reviewable. A bare SHA bump tells a
    // reviewer nothing about whether it crossed a major boundary, which is
    // the entire thing pinning was supposed to buy — and it is the line
    // Dependabot rewrites alongside the pin.
    const missing: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      for (const line of content.split("\n")) {
        if (!/^\s*-?\s*uses:\s*\S+/.test(line)) continue;
        if (/uses:\s*\.{1,2}\//.test(line)) continue;
        if (!/#\s*v?\d/.test(line)) missing.push(`${file}: ${line.trim()}`);
      }
    }
    expect(
      missing,
      "these pins carry no version comment, so a bump would be unreviewable",
    ).toEqual([]);
  });

  for (const { file, refs } of usesByFile) {
    it(`${file}: every remote \`uses:\` is a 40-hex-char SHA, not a tag`, () => {
      const remoteRefs = refs.filter((ref) => !ref.startsWith("./") && !ref.startsWith("../"));
      for (const ref of remoteRefs) {
        const at = ref.lastIndexOf("@");
        const version = at === -1 ? "" : ref.slice(at + 1);
        expect(
          SHA_PIN.test(version),
          `expected ${JSON.stringify(ref)} in ${file} to pin a 40-hex commit SHA after '@', not a floating tag`,
        ).toBe(true);
      }
    });
  }
});
