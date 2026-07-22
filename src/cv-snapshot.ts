import i18n from "./i18n";
import { api } from "./api";
import { getCvLanguage } from "./format";
import type { Education, Language, WorkExperience } from "./types";

// Freezes the current CV builder state into a PDF File, so it can be attached
// to an application as a permanent record of what was actually sent — the CV
// builder is live/unversioned, so without this a later edit rewrites history.
// Mirrors CVTab's downloadPdf (same client-side jsPDF generation and CV-output-
// language labels); defaults to the single-column template (CVTab's default,
// which isn't persisted).
export async function buildCvSnapshotFile(
  template: "single-column" | "two-column" = "single-column",
): Promise<File> {
  const [profile, workExperience, education, languages] = await Promise.all([
    api.profile(),
    api.list<WorkExperience>("work-experience"),
    api.list<Education>("education"),
    api.list<Language>("languages"),
  ]);
  const { generateCvPdf, generateCvPdfTwoColumn } = await import("./pdf");
  const tCv = i18n.getFixedT(getCvLanguage(i18n.resolvedLanguage ?? "en"));
  const labels = {
    present: tCv("cv.present"),
    workExperience: tCv("cv.workExperience"),
    education: tCv("cv.education"),
    languages: tCv("cv.languages"),
    skills: tCv("cv.skills"),
  };
  const cvData = { profile, workExperience, education, languages };
  const doc =
    template === "two-column"
      ? generateCvPdfTwoColumn(cvData, labels)
      : generateCvPdf(cvData, labels);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = profile.name ? profile.name.replace(/\s+/g, "-") : "CV";
  return new File([doc.output("blob")], `${base}-CV-${stamp}.pdf`, {
    type: "application/pdf",
  });
}

// The date-stamped label stored on the snapshot document.
export function cvSnapshotLabel(): string {
  return i18n.t("documents.cvSnapshotLabel", {
    date: new Date().toISOString().slice(0, 10),
  });
}
