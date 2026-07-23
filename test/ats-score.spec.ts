import { describe, it, expect } from "vitest";
import { atsReport, atsBand } from "../src/ats-score";
import type { Profile, Skill, WorkExperience } from "../src/types";

const skill = (id: number, name: string): Skill => ({ id, name });

const exp = (
  id: number,
  description: string | null,
  skills: Skill[],
): WorkExperience => ({
  id,
  company: "Acme",
  title: "Engineer",
  description,
  start_month: null,
  start_year: null,
  end_month: null,
  end_year: null,
  is_current: 0,
  sort_order: id,
  skills,
});

const fullProfile: Profile = {
  id: 1,
  name: "Ada",
  email: "ada@example.com",
  phone: "123",
  location: "NL",
  linkedin: "in/ada",
  github: null,
  portfolio: null,
  summary: "Seasoned platform engineer with a decade of distributed systems.",
  share_token: null,
  calendar_token: null,
  api_key: null,
};

const SKILLS = [
  skill(1, "Kubernetes"),
  skill(2, "Go"),
  skill(3, "Terraform"),
  skill(4, "React"),
  skill(5, "Python"),
  skill(6, "AWS"),
];

describe("atsBand", () => {
  it("bands by score", () => {
    expect(atsBand(90)).toBe("strong");
    expect(atsBand(75)).toBe("strong");
    expect(atsBand(60)).toBe("fair");
    expect(atsBand(50)).toBe("fair");
    expect(atsBand(40)).toBe("weak");
  });
});

describe("atsReport", () => {
  it("splits matched vs missing JD skills and scores coverage", () => {
    const jd = "We need Kubernetes, Go and Terraform experience.";
    const work = [
      exp(1, "Ran 3 clusters on Kubernetes serving 5M requests.", [
        skill(1, "Kubernetes"),
        skill(2, "Go"),
      ]),
      exp(2, "Wrote services in Go.", [
        skill(2, "Go"),
        skill(7, "gRPC"),
        skill(8, "Docker"),
        skill(9, "CI"),
      ]),
    ];
    const r = atsReport(jd, SKILLS, work, fullProfile);
    expect(r.matched.sort()).toEqual(["Go", "Kubernetes"]);
    expect(r.missing).toEqual(["Terraform"]);
    // 2 of 3 JD skills backed → 67% coverage
    expect(r.keywordScore).toBe(67);
  });

  it("passes all content checks for a complete CV", () => {
    const jd = "React and Python.";
    const work = [
      exp(1, "Shipped React apps used by 10k users.", [
        skill(4, "React"),
        skill(5, "Python"),
        skill(1, "Kubernetes"),
        skill(2, "Go"),
        skill(3, "Terraform"),
      ]),
    ];
    const r = atsReport(jd, SKILLS, work, fullProfile);
    expect(r.checks.every((c) => c.passed)).toBe(true);
    expect(r.band).toBe("strong");
  });

  it("fails content checks for a thin CV", () => {
    const thin: Profile = { ...fullProfile, summary: "", email: null };
    const work = [exp(1, "", [skill(4, "React")])];
    const r = atsReport("React", SKILLS, work, thin);
    const failed = r.checks.filter((c) => !c.passed).map((c) => c.key);
    expect(failed).toContain("summary");
    expect(failed).toContain("contact");
    expect(failed).toContain("quantified");
    expect(failed).toContain("experience");
    expect(failed).toContain("skillsLinked");
  });

  it("falls back to content score when the JD mentions no known skills", () => {
    const r = atsReport("Great communication and teamwork.", SKILLS, [], null);
    expect(r.keywordScore).toBe(0);
    expect(r.matched).toEqual([]);
    // all content checks fail → score 0
    expect(r.score).toBe(0);
  });
});
