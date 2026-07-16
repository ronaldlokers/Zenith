import { describe, expect, it } from "vitest";
import { generateCvPdf } from "../src/pdf";
import type { Education, Language, Profile, WorkExperience } from "../src/types";

const labels = {
  present: "Present",
  workExperience: "Work Experience",
  education: "Education",
  languages: "Languages",
};

const profile: Profile = {
  id: 1,
  name: "Ronald Lokers",
  email: "ronald@example.com",
  phone: null,
  location: "Amsterdam",
  linkedin: null,
  github: null,
  portfolio: null,
  summary: "Platform engineer with a decade of infra experience.",
};

const workExperience: WorkExperience[] = [
  {
    id: 1,
    company: "Vandelay Industries",
    title: "Platform Engineer",
    description: "Built the platform team's core infra.",
    start_month: 3,
    start_year: 2021,
    end_month: null,
    end_year: null,
    is_current: 1,
    sort_order: 0,
    skills: [{ id: 1, name: "TypeScript" }],
  },
];

const education: Education[] = [
  {
    id: 1,
    institution: "TU Delft",
    degree: "MSc",
    field: "Computer Science",
    start_month: null,
    start_year: 2010,
    end_month: null,
    end_year: 2014,
    sort_order: 0,
  },
];

const languages: Language[] = [{ id: 1, name: "Dutch", proficiency: "native" }];

describe("generateCvPdf", () => {
  it("produces a valid PDF containing the profile and work experience data", () => {
    const doc = generateCvPdf(
      { profile, workExperience, education, languages },
      labels,
    );
    const raw = doc.output();
    expect(raw.startsWith("%PDF")).toBe(true);
    expect(raw.length).toBeGreaterThan(1000);
    expect(raw).toContain("Ronald Lokers");
    expect(raw).toContain("Vandelay Industries");
    expect(raw).toContain("TU Delft");
  });

  it("renders 'Present' for a current role and an empty PDF for no data", () => {
    const doc = generateCvPdf(
      { profile, workExperience, education, languages },
      labels,
    );
    expect(doc.output()).toContain("Present");

    const empty = generateCvPdf(
      {
        profile: { ...profile, name: null, summary: null },
        workExperience: [],
        education: [],
        languages: [],
      },
      labels,
    );
    expect(empty.output().startsWith("%PDF")).toBe(true);
  });
});
