import { describe, expect, test } from "vitest";
import { mentionsSkill, skillMatchCount } from "./skill-match";
import { atsReport } from "./ats-score";
import type { Profile, Skill, WorkExperience } from "./types";

// \b needs a word character on one side of it, so a skill whose name ends or
// starts with punctuation never has one: "c++" followed by a space has no
// boundary after the second +. Measured against a job description reading
// "strong c++ and c# skills, plus .net" — all three came back unmentioned, so
// they were neither matched nor missing. They vanished from the ATS report and
// from the feed's fit signal, which sorts listings and can filter them out.
//
// Found by coverage: ats-score.ts was at 0%.
const JD =
  "We need strong C++ and C# skills, plus .NET and Node.js. Go and R are a bonus.";

const skill = (name: string): Skill => ({ id: name.length, name }) as Skill;

describe("matching a skill in a job description", () => {
  for (const name of ["C++", "C#", ".NET", "Node.js", "Go", "R"]) {
    test(`finds ${name}`, () => {
      expect(mentionsSkill(JD.toLowerCase(), name)).toBe(true);
    });
  }

  test("still does not mistake a prefix for the skill", () => {
    // The reason \b was there in the first place, and the property the
    // lookarounds have to keep.
    expect(mentionsSkill("we run everything on google cloud", "Go")).toBe(false);
    expect(mentionsSkill("a react codebase", "R")).toBe(false);
    expect(mentionsSkill("javascript everywhere", "Java")).toBe(false);
  });

  test("C matches a C++ posting, as it always has", () => {
    // Pinned rather than fixed: \b did this too, so it is not something this
    // change introduced. Excluding it needs a rule about which symbols may
    // follow a skill name, which is a judgement about the skill list rather
    // than about word boundaries. Left visible instead of silently altered.
    expect(mentionsSkill("strong c++ required", "C")).toBe(true);
  });
});

describe("the signals built on it", () => {
  test("the feed's fit count sees a punctuated skill", () => {
    const skills = [skill("C++"), skill("C#")];
    const backed = new Set(["c++", "c#"]);
    expect(skillMatchCount(JD, skills, backed)).toBe(2);
  });

  test("the ATS report counts it as matched rather than dropping it", () => {
    // The failure was quiet in a particular way: an unmatched-because-unseen
    // skill is not reported as missing either, so the report simply had less
    // in it and the score was computed over the rest.
    const work = [
      { id: 1, description: "Wrote C++ for 5 years", skills: [{ name: "C++" }] },
    ] as unknown as WorkExperience[];
    const report = atsReport(JD, [skill("C++")], work, null as Profile | null);
    expect(report.matched).toEqual(["C++"]);
    expect(report.missing).toEqual([]);
    expect(report.keywordScore).toBe(100);
  });
});
