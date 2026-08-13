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

describe("document titles", () => {
  // A PDF with no /Title shows its file path in the viewer's window and
  // indexes under nothing. These documents leave the product — a CV goes to
  // an employer and lands in their document system — and WCAG 2.4.2 (Page
  // Titled) applies to a PDF as much as to a page. Every generator here was
  // producing untitled files.
  const data = { profile, workExperience, education, languages };
  // Read back out of the serialized file rather than from the jsPDF object:
  // this version exposes no getProperties(), and the Info dictionary is what
  // a viewer, an ATS and a document system actually read.
  //
  // The em dash forces the value out of PDFDocEncoding, so jsPDF writes it
  // as UTF-16BE behind a byte-order mark — which is correct, and which a
  // naive read renders as "þÿ\0R\0o\0n...". Decoded here rather than
  // avoided in the title: pdfinfo reads it back as the intended string, so
  // the file is right and the test was the naive one.
  const decodeTitle = (raw: string): string => {
    if (!raw.startsWith("þÿ")) return raw;
    const bytes = raw.slice(2);
    let out = "";
    // Big-endian pairs, recombined. Taking only the low byte drops the high
    // one, which turns the em dash (U+2014) into U+0014 — a decode that
    // looks like it works until the character is not Latin-1.
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode(
        (bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1),
      );
    }
    return out;
  };
  const titleOf = (doc: ReturnType<typeof generateCvPdf>) => {
    const raw = /\/Title\s*\(([^)]*)\)/.exec(doc.output())?.[1];
    return raw === undefined ? undefined : decodeTitle(raw);
  };

  it("names the CV after whoever it belongs to, in both templates", () => {
    for (const build of [generateCvPdf, generateCvPdfTwoColumn]) {
      expect(titleOf(build(data, labels))).toBe("Ronald Lokers — CV");
    }
  });

  it("still titles a CV with no name on it", () => {
    // Every other field on this profile is optional, and an untitled
    // fallback would put the empty case straight back where it started.
    const nameless = { ...data, profile: { ...profile, name: "" } };
    for (const build of [generateCvPdf, generateCvPdfTwoColumn]) {
      expect(titleOf(build(nameless, labels))).toBe("CV");
    }
  });
});
