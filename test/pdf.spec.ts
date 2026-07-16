import { describe, expect, it } from "vitest";
import {
  generateCvPdf,
  generateCvPdfTwoColumn,
  generateInterviewCheatSheet,
} from "../src/pdf";
import type { Education, Language, Profile, WorkExperience } from "../src/types";

const labels = {
  present: "Present",
  workExperience: "Work Experience",
  education: "Education",
  languages: "Languages",
  skills: "Skills",
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

describe("generateCvPdfTwoColumn", () => {
  it("produces a distinct valid PDF containing the same data plus aggregated skills", () => {
    const doc = generateCvPdfTwoColumn(
      { profile, workExperience, education, languages },
      labels,
    );
    const raw = doc.output();
    expect(raw.startsWith("%PDF")).toBe(true);
    expect(raw.length).toBeGreaterThan(1000);
    expect(raw).toContain("Ronald Lokers");
    expect(raw).toContain("Vandelay Industries");
    expect(raw).toContain("TU Delft");
    expect(raw).toContain("TypeScript");
    expect(raw).toContain("Dutch");

    const singleColumn = generateCvPdf(
      { profile, workExperience, education, languages },
      labels,
    );
    expect(raw).not.toBe(singleColumn.output());
  });

  it("falls back to a full-width continuation page when work experience overflows", () => {
    const manyRoles: WorkExperience[] = Array.from({ length: 15 }, (_, i) => ({
      ...workExperience[0],
      id: i + 1,
      title: `Role ${i}`,
      description:
        "A long description of the role that takes up several lines of wrapped text in the main column, repeated to force pagination.",
    }));
    const doc = generateCvPdfTwoColumn(
      { profile, workExperience: manyRoles, education, languages },
      labels,
    );
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});

describe("generateInterviewCheatSheet", () => {
  const cheatSheetLabels = {
    contact: "Contact",
    companyResearch: "Company research",
    prepChecklist: "Interview prep",
    pastInteractions: "Timeline",
    noNotes: "Nothing logged yet.",
  };

  it("produces a valid PDF containing company, contact, prep, and interaction data", () => {
    const doc = generateInterviewCheatSheet(
      {
        title: "Senior Platform Engineer",
        companyName: "Acme Cloud",
        companyWebsite: "https://acme.example",
        companyDescription: "Cloud infrastructure platform.",
        contactName: "Jamie Park",
        contactRole: "Talent Partner",
        contactEmail: "jamie@acme.example",
        contactPhone: null,
        notes: "Warm intro via referral.",
        prepItems: [
          { text: "Research the team", done: true },
          { text: "Prepare 3 questions", done: false },
        ],
        interactions: [
          { type: "call", happened_at: "2026-01-05", notes: "Recruiter screen" },
        ],
      },
      cheatSheetLabels,
    );
    const raw = doc.output();
    expect(raw.startsWith("%PDF")).toBe(true);
    expect(raw).toContain("Senior Platform Engineer");
    expect(raw).toContain("Acme Cloud");
    expect(raw).toContain("Jamie Park");
    expect(raw).toContain("Research the team");
    expect(raw).toContain("Recruiter screen");
  });

  it("falls back to the no-notes label for empty sections", () => {
    const doc = generateInterviewCheatSheet(
      {
        title: "DevOps Engineer",
        companyName: null,
        companyWebsite: null,
        companyDescription: null,
        contactName: null,
        contactRole: null,
        contactEmail: null,
        contactPhone: null,
        notes: null,
        prepItems: [],
        interactions: [],
      },
      cheatSheetLabels,
    );
    expect(doc.output().startsWith("%PDF")).toBe(true);
  });
});
