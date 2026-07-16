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
