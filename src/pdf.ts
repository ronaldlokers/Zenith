import { jsPDF } from "jspdf";
import type { Education, Language, Profile, WorkExperience } from "./types";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatRange(
  startMonth: number | null,
  startYear: number | null,
  endMonth: number | null,
  endYear: number | null,
  isCurrent: boolean,
  presentLabel: string,
): string {
  const start = startYear
    ? `${startMonth ? MONTH_NAMES[startMonth - 1] + " " : ""}${startYear}`
    : "";
  const end = isCurrent
    ? presentLabel
    : endYear
      ? `${endMonth ? MONTH_NAMES[endMonth - 1] + " " : ""}${endYear}`
      : "";
  if (!start && !end) return "";
  return `${start} – ${end}`;
}

export interface CvPdfLabels {
  present: string;
  workExperience: string;
  education: string;
  languages: string;
  skills: string;
}

export interface CvPdfData {
  profile: Profile;
  workExperience: WorkExperience[];
  education: Education[];
  languages: Language[];
}

// Single ATS-friendly single-column layout (issue #70) — plain text
// flow, no columns/graphics, so applicant-tracking-system parsers
// read it the same way a human does. Client-side generation (jsPDF,
// pure JS, no WASM/native deps) rather than Cloudflare's paid Browser
// Rendering API, per #68/#70's own recommendation for a first pass.
export function generateCvPdf(data: CvPdfData, labels: CvPdfLabels): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marginX = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 18;
  let y = 20;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 20;
    }
  };

  const addParagraph = (text: string, size: number, lineHeight: number) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, marginX, y);
      y += lineHeight;
    }
  };

  const addSectionHeading = (text: string) => {
    ensureSpace(10);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(text.toUpperCase(), marginX, y);
    y += 1.5;
    doc.setDrawColor(180);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
  };

  const { profile, workExperience, education, languages } = data;

  // --- Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(profile.name || "", marginX, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const contactLine = [profile.email, profile.phone, profile.location]
    .filter(Boolean)
    .join("  ·  ");
  if (contactLine) {
    doc.text(contactLine, marginX, y);
    y += 5;
  }
  const linksLine = [profile.linkedin, profile.github, profile.portfolio]
    .filter(Boolean)
    .join("  ·  ");
  if (linksLine) {
    doc.text(linksLine, marginX, y);
    y += 5;
  }

  if (profile.summary) {
    y += 3;
    addParagraph(profile.summary, 10.5, 5);
  }

  // --- Work experience (reverse-chronological) ---
  if (workExperience.length > 0) {
    addSectionHeading(labels.workExperience);
    const sorted = [...workExperience].sort((a, b) => {
      const ay = a.is_current ? 9999 : (a.end_year ?? a.start_year ?? 0);
      const by = b.is_current ? 9999 : (b.end_year ?? b.start_year ?? 0);
      return by - ay;
    });
    for (const w of sorted) {
      ensureSpace(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`${w.title} — ${w.company}`, marginX, y);
      const range = formatRange(
        w.start_month,
        w.start_year,
        w.end_month,
        w.end_year,
        !!w.is_current,
        labels.present,
      );
      if (range) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        const rangeWidth = doc.getTextWidth(range);
        doc.text(range, pageWidth - marginX - rangeWidth, y);
      }
      y += 5.5;
      doc.setFont("helvetica", "normal");
      if (w.description) addParagraph(w.description, 10, 4.8);
      if (w.skills.length > 0) {
        addParagraph(w.skills.map((s) => s.name).join(", "), 9.5, 4.5);
      }
      y += 3;
    }
  }

  // --- Education ---
  if (education.length > 0) {
    addSectionHeading(labels.education);
    const sorted = [...education].sort(
      (a, b) => (b.end_year ?? b.start_year ?? 0) - (a.end_year ?? a.start_year ?? 0),
    );
    for (const ed of sorted) {
      ensureSpace(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      const title = [ed.institution, ed.degree].filter(Boolean).join(" — ");
      doc.text(title, marginX, y);
      const range = formatRange(
        null,
        ed.start_year,
        null,
        ed.end_year,
        false,
        labels.present,
      );
      if (range) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        const rangeWidth = doc.getTextWidth(range);
        doc.text(range, pageWidth - marginX - rangeWidth, y);
      }
      y += 5.5;
      doc.setFont("helvetica", "normal");
      if (ed.field) addParagraph(ed.field, 10, 4.8);
      y += 2;
    }
  }

  // --- Languages ---
  if (languages.length > 0) {
    addSectionHeading(labels.languages);
    addParagraph(
      languages.map((l) => `${l.name} (${l.proficiency})`).join(", "),
      10,
      5,
    );
  }

  return doc;
}

export interface InterviewCheatSheetLabels {
  contact: string;
  companyResearch: string;
  prepChecklist: string;
  pastInteractions: string;
  noNotes: string;
}

export interface InterviewCheatSheetData {
  title: string;
  companyName: string | null;
  companyWebsite: string | null;
  companyDescription: string | null;
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  prepItems: { text: string; done: boolean | number }[];
  interactions: { type: string; happened_at: string; notes: string | null }[];
}

// One-page interview cheat sheet (#137) — a print/PDF-friendly summary
// distinct from the CV PDF: company research, contact, prep checklist,
// and past interactions in one place instead of switching between the
// detail modal's sections mid-interview.
export function generateInterviewCheatSheet(
  data: InterviewCheatSheetData,
  labels: InterviewCheatSheetLabels,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marginX = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 18;
  let y = 20;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 20;
    }
  };

  const addParagraph = (text: string, size: number, lineHeight: number) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, marginX, y);
      y += lineHeight;
    }
  };

  const addSectionHeading = (text: string) => {
    ensureSpace(10);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(text.toUpperCase(), marginX, y);
    y += 1.5;
    doc.setDrawColor(180);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
  };

  // --- Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.title, marginX, y);
  y += 7;
  if (data.companyName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(data.companyName, marginX, y);
    y += 8;
  }

  // --- Contact ---
  addSectionHeading(labels.contact);
  const contactLine = [data.contactName, data.contactRole]
    .filter(Boolean)
    .join(" — ");
  if (contactLine) addParagraph(contactLine, 11, 5.5);
  const contactDetails = [data.contactEmail, data.contactPhone]
    .filter(Boolean)
    .join("  ·  ");
  if (contactDetails) addParagraph(contactDetails, 10, 5);
  if (!contactLine && !contactDetails) addParagraph(labels.noNotes, 10, 5);

  // --- Company research ---
  addSectionHeading(labels.companyResearch);
  if (data.companyWebsite) addParagraph(data.companyWebsite, 10, 5);
  if (data.companyDescription) addParagraph(data.companyDescription, 10.5, 5);
  if (!data.companyWebsite && !data.companyDescription) {
    addParagraph(labels.noNotes, 10, 5);
  }
  if (data.notes) {
    y += 2;
    addParagraph(data.notes, 10.5, 5);
  }

  // --- Prep checklist ---
  addSectionHeading(labels.prepChecklist);
  if (data.prepItems.length === 0) {
    addParagraph(labels.noNotes, 10, 5);
  } else {
    for (const item of data.prepItems) {
      addParagraph(`${item.done ? "[x]" : "[ ]"} ${item.text}`, 10.5, 5.5);
    }
  }

  // --- Past interactions ---
  addSectionHeading(labels.pastInteractions);
  if (data.interactions.length === 0) {
    addParagraph(labels.noNotes, 10, 5);
  } else {
    const sorted = [...data.interactions].sort((a, b) =>
      a.happened_at.localeCompare(b.happened_at),
    );
    for (const it of sorted) {
      const line = `${it.happened_at.slice(0, 10)} — ${it.type}${it.notes ? `: ${it.notes}` : ""}`;
      addParagraph(line, 10, 5);
    }
  }

  return doc;
}

export type CvTemplate = "single-column" | "two-column";

// Two-column layout (issue #71) — a sidebar (contact, skills, languages)
// beside a main column (summary, work experience, education). Built
// with the same manual x/y positioning as the single-column template:
// jsPDF has no CSS layout engine, but a fixed two-column split needs
// none — each column is just text drawn at a different x offset with
// its own width and its own page-break tracking, so client-side
// generation still holds up here without reaching for Cloudflare's
// Browser Rendering API. The sidebar is assumed to fit on page 1 (it's
// short by nature — contact info, a skills list, languages); if the
// main column overflows, continuation pages drop the sidebar split and
// run full width, which is how most two-column resume templates
// handle the same problem.
export function generateCvPdfTwoColumn(
  data: CvPdfData,
  labels: CvPdfLabels,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const marginTop = 20;
  const bottomLimit = pageHeight - 16;
  const sidebarWidth = 52;
  const gutter = 8;
  const mainXStart = marginX + sidebarWidth + gutter;

  const { profile, workExperience, education, languages } = data;

  // --- Header (full width) ---
  let headerY = marginTop;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(profile.name || "", marginX, headerY);
  headerY += 7;
  doc.setDrawColor(60);
  doc.setLineWidth(0.6);
  doc.line(marginX, headerY, pageWidth - marginX, headerY);
  headerY += 6;

  const bodyTop = headerY;

  // --- Sidebar column (contact, skills, languages) ---
  let sy = bodyTop;
  const sidebarHeading = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(text.toUpperCase(), marginX, sy);
    sy += 4.5;
    doc.setFont("helvetica", "normal");
  };
  const sidebarText = (text: string, size = 9) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, sidebarWidth) as string[];
    for (const line of lines) {
      doc.text(line, marginX, sy);
      sy += 4.2;
    }
  };

  sidebarHeading("Contact");
  for (const line of [profile.email, profile.phone, profile.location]) {
    if (line) sidebarText(line);
  }
  sy += 2;
  const links = [profile.linkedin, profile.github, profile.portfolio].filter(
    Boolean,
  ) as string[];
  if (links.length > 0) {
    for (const link of links) sidebarText(link, 8);
    sy += 2;
  }

  const allSkills = Array.from(
    new Map(
      workExperience.flatMap((w) => w.skills).map((s) => [s.name.toLowerCase(), s.name]),
    ).values(),
  );
  if (allSkills.length > 0) {
    sy += 2;
    sidebarHeading(labels.skills);
    sidebarText(allSkills.join(", "), 9);
  }

  if (languages.length > 0) {
    sy += 4;
    sidebarHeading(labels.languages);
    for (const l of languages) sidebarText(`${l.name} — ${l.proficiency}`);
  }

  // --- Main column (summary, work experience, education) ---
  let my = bodyTop;
  let mainX = mainXStart;
  let mainWidth = pageWidth - mainXStart - marginX;

  const ensureSpace = (needed: number) => {
    if (my + needed > bottomLimit) {
      doc.addPage();
      my = marginTop;
      // Continuation pages drop the sidebar split and run full width.
      mainX = marginX;
      mainWidth = pageWidth - marginX * 2;
    }
  };
  const addParagraph = (text: string, size: number, lineHeight: number) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, mainWidth) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, mainX, my);
      my += lineHeight;
    }
  };
  const addSectionHeading = (text: string) => {
    ensureSpace(10);
    my += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(text.toUpperCase(), mainX, my);
    my += 1.5;
    doc.setDrawColor(180);
    doc.line(mainX, my, mainX + mainWidth, my);
    my += 5.5;
    doc.setFont("helvetica", "normal");
  };

  if (profile.summary) {
    addParagraph(profile.summary, 10, 4.8);
    my += 3;
  }

  if (workExperience.length > 0) {
    addSectionHeading(labels.workExperience);
    const sorted = [...workExperience].sort((a, b) => {
      const ay = a.is_current ? 9999 : (a.end_year ?? a.start_year ?? 0);
      const by = b.is_current ? 9999 : (b.end_year ?? b.start_year ?? 0);
      return by - ay;
    });
    for (const w of sorted) {
      ensureSpace(11);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(`${w.title} — ${w.company}`, mainX, my);
      my += 4.8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const range = formatRange(
        w.start_month,
        w.start_year,
        w.end_month,
        w.end_year,
        !!w.is_current,
        labels.present,
      );
      if (range) {
        doc.text(range, mainX, my);
        my += 4.5;
      }
      if (w.description) addParagraph(w.description, 9.5, 4.4);
      my += 3;
    }
  }

  if (education.length > 0) {
    addSectionHeading(labels.education);
    const sorted = [...education].sort(
      (a, b) => (b.end_year ?? b.start_year ?? 0) - (a.end_year ?? a.start_year ?? 0),
    );
    for (const ed of sorted) {
      ensureSpace(9);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text([ed.institution, ed.degree].filter(Boolean).join(" — "), mainX, my);
      my += 4.8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const range = formatRange(null, ed.start_year, null, ed.end_year, false, labels.present);
      if (ed.field || range) {
        doc.text([ed.field, range].filter(Boolean).join("  ·  "), mainX, my);
        my += 4.5;
      }
      my += 2;
    }
  }

  return doc;
}
