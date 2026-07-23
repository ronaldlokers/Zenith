// CV builder extracted from App.tsx (#285 split) — the CV tab and its
// profile / work-experience / education / languages sections + forms.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { api } from "./api";
import { LoadingSkeleton } from "./ui";
import { Button, SideList } from "./components";
import type { Education, Language, Profile, WorkExperience } from "./types";
import { getCvLanguage } from "./format";
import { TailorPanel } from "./cv/tailor";
import { CvPreview } from "./cv/preview";
import { CvVersions } from "./cv/versions";
import { LinkedInOptimizer } from "./cv/linkedin";
import {
  EducationSection,
  LanguagesSection,
  ProfileSection,
  WorkExperienceSection,
} from "./cv/sections";

export function CVTab({
  onError,
  notify,
}: {
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t, i18n } = useTranslation();
  const tailorJd = (useLocation().state as { tailorJd?: string } | null)
    ?.tailorJd;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workExp, setWorkExp] = useState<WorkExperience[] | null>(null);
  const [education, setEducation] = useState<Education[] | null>(null);
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [template, setTemplate] = useState<"single-column" | "two-column">(
    "single-column",
  );

  const load = useCallback(
    () =>
      Promise.all([
        api.profile().then(setProfile),
        api.list<WorkExperience>("work-experience").then(setWorkExp),
        api.list<Education>("education").then(setEducation),
        api.list<Language>("languages").then(setLanguages),
      ]).catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!profile || !workExp || !education || !languages) {
    return <LoadingSkeleton />;
  }

  // Live preview (#134, #386) — a styled HTML document that mirrors the two
  // PDF templates and updates straight from React state, instead of embedding
  // a regenerated PDF (which exposed the browser's PDF-viewer chrome). Labels
  // use the CV output language, same as the exported PDF.
  const tCv = i18n.getFixedT(getCvLanguage(i18n.resolvedLanguage ?? "en"));
  const cvLabels = {
    present: tCv("cv.present"),
    workExperience: tCv("cv.workExperience"),
    education: tCv("cv.education"),
    languages: tCv("cv.languages"),
    skills: tCv("cv.skills"),
    proficiency: {
      conversational: tCv("cv.proficiency.conversational"),
      fluent: tCv("cv.proficiency.fluent"),
      native: tCv("cv.proficiency.native"),
    },
  };

  const downloadPdf = async () => {
    // Dynamic import — jsPDF (~400kB) is only needed once someone
    // actually downloads a CV, not on every page load.
    const { generateCvPdf, generateCvPdfTwoColumn } = await import("./pdf");
    const tCv = i18n.getFixedT(getCvLanguage(i18n.resolvedLanguage ?? "en"));
    const labels = {
      present: tCv("cv.present"),
      workExperience: tCv("cv.workExperience"),
      education: tCv("cv.education"),
      languages: tCv("cv.languages"),
      skills: tCv("cv.skills"),
    };
    const cvData = { profile, workExperience: workExp, education, languages };
    const doc =
      template === "two-column"
        ? generateCvPdfTwoColumn(cvData, labels)
        : generateCvPdf(cvData, labels);
    const filename = profile.name
      ? `${profile.name.replace(/\s+/g, "-")}-CV.pdf`
      : "CV.pdf";
    doc.save(filename);
  };

  return (
    <section className="cv-tab">
      <div className="cv-toolbar">
        <div className="cv-template-picker">
          <span className="cv-template-picker-label">{t("cv.template")}</span>
          <div className="cv-template-options">
            <button
              type="button"
              className={`cv-template-option${template === "single-column" ? " selected" : ""}`}
              aria-pressed={template === "single-column"}
              onClick={() => setTemplate("single-column")}
            >
              <span className="cv-template-thumb cv-template-thumb-single">
                <span className="cv-t-line" />
                <span className="cv-t-line" />
                <span className="cv-t-line short" />
              </span>
              {t("cv.templateSingle")}
            </button>
            <button
              type="button"
              className={`cv-template-option${template === "two-column" ? " selected" : ""}`}
              aria-pressed={template === "two-column"}
              onClick={() => setTemplate("two-column")}
            >
              <span className="cv-template-thumb cv-template-thumb-two-col">
                <span className="cv-t-col">
                  <span className="cv-t-line" />
                  <span className="cv-t-line short" />
                </span>
                <span className="cv-t-col wide">
                  <span className="cv-t-line" />
                  <span className="cv-t-line" />
                </span>
              </span>
              {t("cv.templateTwoColumn")}
            </button>
          </div>
        </div>
        <Button variant="primary" onClick={downloadPdf}>
          {t("cv.downloadPdf")}
        </Button>
      </div>
      <div className="cv-layout">
        <div className="cv-main">
          <TailorPanel
            profile={profile}
            workExp={workExp}
            onApplied={load}
            onError={onError}
            notify={notify}
            initialJd={tailorJd}
          />
          <ProfileSection
            profile={profile}
            onChanged={load}
            onError={onError}
            notify={notify}
          />
          <LinkedInOptimizer onError={onError} notify={notify} />
          <WorkExperienceSection
            items={workExp}
            onChanged={load}
            onError={onError}
            notify={notify}
          />
          <EducationSection
            items={education}
            onChanged={load}
            onError={onError}
            notify={notify}
          />
          <LanguagesSection
            items={languages}
            onChanged={load}
            onError={onError}
            notify={notify}
          />
        </div>
        <aside className="jobs-side">
          <h3 className="side-h">{t("cv.completeness")}</h3>
          <SideList>
            <li>
              <span className="side-title">{t("cv.profile")}</span>
              <span className="side-co">
                {[profile.name, profile.email, profile.summary].filter(Boolean).length}/3
              </span>
            </li>
            <li>
              <span className="side-title">{t("cv.workExperience")}</span>
              <span className="side-co">{workExp.length}</span>
            </li>
            <li>
              <span className="side-title">{t("cv.education")}</span>
              <span className="side-co">{education.length}</span>
            </li>
            <li>
              <span className="side-title">{t("cv.languages")}</span>
              <span className="side-co">{languages.length}</span>
            </li>
          </SideList>
          <h3 className="side-h cv-versions-h">{t("cvVersions.title")}</h3>
          <CvVersions
            current={{
              profile,
              workExperience: workExp,
              education,
              languages,
            }}
            template={template}
            onError={onError}
            notify={notify}
          />
          <h3 className="side-h cv-preview-h">{t("cv.livePreview")}</h3>
          <div className="cv-preview-frame" aria-label={t("cv.livePreview")}>
            <CvPreview
              profile={profile}
              workExperience={workExp}
              education={education}
              languages={languages}
              template={template}
              labels={cvLabels}
            />
          </div>
        </aside>
      </div>
    </section>
  );
}
