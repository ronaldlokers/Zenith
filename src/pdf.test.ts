import { describe, expect, it } from "vitest";
import {
  generateCvPdf,
  generateCvPdfTwoColumn,
  generateInterviewCheatSheet,
  type CvPdfData,
  type CvPdfLabels,
} from "./pdf";
import type { jsPDF } from "jspdf";

// pdf.ts had no tests at all — 350 statements generating the documents that
// leave the product. A CV goes to an employer; nothing here checked what came
// out of it.
//
// These read the generated content streams rather than rendering, which is
// enough to see where text lands and on which page — the layout defects are
// positional, not visual.

const LABELS: CvPdfLabels = {
  present: "Present",
  workExperience: "Work experience",
  education: "Education",
  languages: "Languages",
  skills: "Skills",
};

/** The text drawn on each page, in order. */
function pageText(doc: jsPDF): string[][] {
  const pages = (doc as unknown as { internal: { pages: string[][] } }).internal
    .pages;
  return pages
    .filter((p) => p && p.length)
    .map((p) =>
      // Parentheses inside a PDF string are escaped as \( and \), so a
      // naive [^)]* stops at the first one and mangles every line containing
      // brackets — "Dutch (native)" among them. This cost a false reading:
      // a heading looked stranded because the text after it had been cut in
      // half by the parser rather than moved by the layout.
      [...p.join("\n").matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)].map((m) =>
        m[1].replace(/\\([()\\])/g, "$1"),
      ),
    );
}

/** The uppercase section labels the generators draw. */
const HEADINGS = Object.values(LABELS)
  .map((l) => l.toUpperCase())
  .concat(["SKILLS", "LANGUAGES", "EDUCATION", "WORK EXPERIENCE"]);

function longCv(roles: number, descRepeat = 10, summaryRepeat = 6): CvPdfData {
  return {
    profile: {
      name: "Alex Rivera",
      email: "alex@example.com",
      phone: "+31 6 1234 5678",
      location: "Amsterdam",
      linkedin: null,
      website: null,
      summary: "Platform engineer with a long record of delivery. ".repeat(
        summaryRepeat,
      ),
      skills: "TypeScript, Go, Terraform",
    } as unknown as CvPdfData["profile"],
    workExperience: Array.from({ length: roles }, (_, i) => ({
      id: i + 1,
      company: `Company ${i + 1}`,
      title: `Senior Engineer ${i + 1}`,
      description: "Ran the platform team. ".repeat(descRepeat),
      start_month: 1,
      start_year: 2010 + i,
      end_month: 12,
      end_year: 2011 + i,
      is_current: 0,
      sort_order: i,
      skills: [],
    })) as unknown as CvPdfData["workExperience"],
    education: [
      {
        id: 1,
        institution: "TU Delft",
        degree: "BSc",
        field: "Computer Science",
        start_year: 2006,
        end_year: 2010,
        sort_order: 0,
      },
    ] as unknown as CvPdfData["education"],
    languages: [
      { id: 1, name: "Dutch", proficiency: "native", sort_order: 0 },
      { id: 2, name: "English", proficiency: "fluent", sort_order: 1 },
    ] as unknown as CvPdfData["languages"],
  };
}

describe("a CV that runs past one page", () => {
  // The reproduction, found by sweeping the fixture size rather than guessed:
  // seven roles, that description length, that summary. Page 1 ended with
  // "LANGUAGES" and the languages themselves were overleaf.
  //
  // The arithmetic behind it, which is why a single fixture is not enough:
  // the heading reserved 10mm and then consumed 9.5 drawing itself, leaving
  // half a millimetre for a first entry that asks for 12. Any y in the
  // resulting ~11mm window strands the heading, and most fixtures miss that
  // window entirely — the first version of this test did, and passed with the
  // fix reverted.
  const STRANDS = { roles: 7, descRepeat: 15, summaryRepeat: 2 };

  function orphanedHeadings(doc: ReturnType<typeof generateCvPdf>) {
    return pageText(doc)
      .map((items, i) => ({ page: i + 1, last: items[items.length - 1] }))
      .filter(({ last }) => HEADINGS.includes(last));
  }

  it("does not strand a heading at the foot of a page", () => {
    const doc = generateCvPdf(
      longCv(STRANDS.roles, STRANDS.descRepeat, STRANDS.summaryRepeat),
      LABELS,
    );
    expect(pageText(doc).length, "the fixture stopped spanning pages").toBeGreaterThan(1);
    expect(
      orphanedHeadings(doc),
      "a section heading is the last thing on a page, with its content overleaf",
    ).toEqual([]);
  });

  it("does not strand one at any length of CV", () => {
    // 600 documents, under a second. A layout rule that holds for one
    // fixture and not the next is not a rule, and the window this guards is
    // narrow enough that hitting it by hand is luck.
    const found: string[] = [];
    for (let roles = 1; roles <= 10; roles++) {
      for (let rep = 1; rep <= 20; rep++) {
        for (const summary of [2, 6, 10]) {
          const bad = orphanedHeadings(generateCvPdf(longCv(roles, rep, summary), LABELS));
          if (bad.length) {
            found.push(`roles=${roles} rep=${rep} summary=${summary}: ${bad[0].last}`);
          }
        }
      }
    }
    expect(found.slice(0, 5), "a heading is stranded for some CV lengths").toEqual([]);
  });

  it("still puts every heading in the document exactly once", () => {
    // The fix moves headings between pages; it must not drop or duplicate
    // one, which a naive "push it to the next page" would.
    const all = pageText(
      generateCvPdf(longCv(STRANDS.roles, STRANDS.descRepeat, STRANDS.summaryRepeat), LABELS),
    ).flat();
    for (const heading of ["WORK EXPERIENCE", "EDUCATION", "LANGUAGES"]) {
      expect(
        all.filter((t) => t === heading),
        `${heading} appears the wrong number of times`,
      ).toHaveLength(1);
    }
  });

  it("keeps the person's name at the top of the first page", () => {
    expect(pageText(generateCvPdf(longCv(9), LABELS))[0][0]).toBe("Alex Rivera");
  });
});

describe("the two-column CV", () => {
  it("never ends a page with a heading", () => {
    const pages = pageText(generateCvPdfTwoColumn(longCv(9), LABELS));
    const orphans = pages
      .map((items, i) => ({ page: i + 1, last: items[items.length - 1] }))
      .filter(({ last }) => HEADINGS.includes(last));
    expect(orphans, "a heading is stranded at the foot of a page").toEqual([]);
  });
});

describe("the interview cheat sheet", () => {
  it("never ends a page with a heading", () => {
    const doc = generateInterviewCheatSheet(
      {
        title: "Staff Engineer",
        companyName: "Northwind",
        companyWebsite: "https://northwind.example",
        contactName: "Sam Okafor",
        contactRole: "Engineering Manager",
        contactEmail: "sam@northwind.example",
        contactPhone: null,
        notes: "Ask about the platform roadmap. ".repeat(40),
        prepItems: Array.from({ length: 14 }, (_, i) => ({
          text: `Prepare answer number ${i + 1} about scaling and ownership.`,
          done: i % 2 === 0,
        })),
        interactions: Array.from({ length: 10 }, (_, i) => ({
          type: "call",
          happened_at: `2026-0${(i % 9) + 1}-01`,
          notes: "Spoke about the team and the roadmap. ".repeat(3),
        })),
      },
      {
        contact: "Contact",
        companyResearch: "Company research",
        prepChecklist: "Prep checklist",
        pastInteractions: "Past interactions",
        noNotes: "No notes",
      },
    );
    const pages = pageText(doc);
    expect(pages.length, "the fixture no longer spans pages").toBeGreaterThan(1);
    const headings = [
      "CONTACT",
      "COMPANY RESEARCH",
      "PREP CHECKLIST",
      "PAST INTERACTIONS",
    ];
    const orphans = pages
      .map((items, i) => ({ page: i + 1, last: items[items.length - 1] }))
      .filter(({ last }) => headings.includes(last));
    expect(orphans, "a heading is stranded at the foot of a page").toEqual([]);
  });
});
