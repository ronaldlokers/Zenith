import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every dependency bump was a manual, solo decision with no scheduled nudge,
// on a stack that sits near-latest everywhere. That is a fine posture for a
// hobby project and a real one for something aiming to be a polished public
// product, where a security patch should not wait for someone to notice it.
//
// The sharp edge here is not the config, it is what a wrangler bump does:
// worker-configuration.d.ts is generated, committed, and records the workerd
// version it came from. `wrangler types --check` in CI fails the moment the
// dependency moves — correctly, and that gate has already caught a branch that
// passed everything else — but on a bot's PR it looks like an unexplained red
// check. So the config has to say what to run, or the automation creates work
// nobody knows how to finish.
const ROOT = new URL("..", import.meta.url).pathname;
const PATH = `${ROOT}.github/dependabot.yml`;

describe("dependency automation", () => {
  it("exists at all", () => {
    expect(
      existsSync(PATH),
      "nothing opens version-bump PRs, so upgrades happen only when someone remembers",
    ).toBe(true);
  });

  const config = existsSync(PATH) ? readFileSync(PATH, "utf8") : "";

  it("covers npm and the actions the workflows pin", () => {
    // The workflows pin actions/checkout@v4 and friends by major, so they
    // drift silently too.
    expect(config).toMatch(/package-ecosystem:\s*"?npm"?/);
    expect(config).toMatch(/package-ecosystem:\s*"?github-actions"?/);
  });

  it("says how to fix the wrangler bump it will open", () => {
    // The one that stops this being a config nobody can act on.
    // The runnable command, not a mention of it. The first version of this
    // matched /wrangler types/, which the prose describing the *problem*
    // satisfies — so deleting the fix left the test green.
    expect(
      config,
      "a wrangler bump will fail `wrangler types --check` and the config never says what to run",
    ).toMatch(/npx wrangler types/);
  });

  it("is valid YAML with the two updates at the top level", () => {
    // A malformed dependabot.yml is silently ignored by GitHub — no error,
    // no PRs, and the repo looks configured.
    const updates = [...config.matchAll(/^\s{2}- package-ecosystem:/gm)];
    expect(updates.length, "the updates list is not shaped as dependabot reads it").toBe(2);
    expect(config).toMatch(/^version: 2$/m);
  });
});
