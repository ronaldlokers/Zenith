import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The zenith-design skill tells an agent what the production component
// vocabulary is. It said "29 owned components" and named 25 of them while 40
// existed — so an agent following it would have rebuilt PillTabs, RowMenu,
// SettingsNav, TabBar or WordmarkMenu by hand rather than composing what
// already ships, which is the precise failure the skill exists to prevent.
//
// Same shape as locked-decisions.spec.ts: a claim in prose that nothing
// stopped from going stale. The count is the cheap half to check, and the
// half that was wrong.
const DIR = new URL("../src/components/", import.meta.url).pathname;
const SKILL = new URL("../.claude/skills/zenith-design/SKILL.md", import.meta.url)
  .pathname;

const components = readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx") && !/\.(test|stories)\.tsx$/.test(f))
  .map((f) => f.replace(/\.tsx$/, ""));

describe("component vocabulary", () => {
  it("matches the count the skill states", () => {
    const skill = readFileSync(SKILL, "utf8");
    const stated = skill.match(/\*\*(\d+) owned components/);
    expect(stated, "the skill no longer states a count").toBeTruthy();
    expect(
      Number(stated![1]),
      `src/components/ holds ${components.length}; add the new component to ` +
        "the skill's grouped list and update the number",
    ).toBe(components.length);
  });

  it("names every component that carries its own stylesheet", () => {
    // The two without one (MockInterview, NegotiationRoleplay) are called out
    // in the skill as exceptions, so they are exempt here rather than
    // silently excluded — if either grows a stylesheet, this starts
    // requiring it by name and the exception note should go.
    const skill = readFileSync(SKILL, "utf8");
    const missing = components.filter(
      (c) =>
        readdirSync(DIR).includes(`${c}.css`) &&
        !new RegExp(`\\b${c}\\b`).test(skill),
    );
    expect(missing, "owned components absent from the skill's list").toEqual([]);
  });
});
