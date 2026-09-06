import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CLAUDE.md says lint "must be clean, zero warnings", and CI ran a command
// that could not enforce it: bare `oxlint` reports warnings and exits 0.
//
// Measured on this repo before the change, with a probe component carrying
// `useEffect(() => setN(n + 1), [])`:
//
//   npx oxlint                    -> warning react-hooks(exhaustive-deps), exit 0
//   npx oxlint --max-warnings=0   -> exit 1
//
// The repo was clean at the time, so this was a hole rather than a failure —
// which is exactly the kind that stays open until something falls through it.
// exhaustive-deps is the rule the guide singles out, and it is a warning by
// default.
const ROOT = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
const ci = readFileSync(`${ROOT}.github/workflows/ci.yml`, "utf8");

describe("the lint gate", () => {
  it("fails the build on a warning, not just an error", () => {
    expect(
      pkg.scripts.lint,
      "npm run lint exits 0 with warnings present, so the zero-warning rule is unenforced",
    ).toMatch(/--max-warnings[= ]0|--deny-warnings/);
  });

  it("is the command the repo's own instructions name", () => {
    // The same hole in a second place: the component-extraction skill told
    // whoever followed it to run `npx oxlint` directly, which is the exact
    // invocation that cannot fail on a warning.
    const skill = readFileSync(
      `${ROOT}.claude/skills/component-extraction/SKILL.md`,
      "utf8",
    );
    expect(skill, "a repo doc still sends people to bare oxlint").not.toMatch(
      /npx oxlint(?!\s*--max-warnings)/,
    );
  });

  it("is the command CI actually runs", () => {
    // A gate only counts where it is invoked. If CI ever calls oxlint
    // directly, hardening the script here would be decoration.
    expect(ci).toMatch(/run: npm run lint/);
    expect(ci, "CI bypasses the npm script and its flags").not.toMatch(
      /run: (npx )?oxlint/,
    );
  });
});
