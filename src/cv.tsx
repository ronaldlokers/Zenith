// CV builder extracted from App.tsx (#285 split) — the CV tab and its
// profile / work-experience / education / languages sections + forms.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { api } from "./api";
import { Button, Skeleton } from "./components";
import { PrintIcon } from "./icons";
import type {
  CvSnapshotData,
  CvVersion,
  Education,
  Language,
  Profile,
  WorkExperience,
} from "./types";
import { getCvLanguage } from "./format";
import { TailorPanel } from "./cv/tailor";
import { CvPreview } from "./cv/preview";
import { CvVariantRail } from "./cv/versions";
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
  // Saved variants (#474) live in the rail on the plate now, and picking one
  // is how you look at it — so the selection has to be here, where both the
  // document on the plate and the PDF it exports can read it.
  const [versions, setVersions] = useState<CvVersion[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [versionBusy, setVersionBusy] = useState(false);

  const loadVersions = useCallback(
    () =>
      api
        .list<CvVersion>("cv-versions")
        .then(setVersions)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );
  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

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
    return <Skeleton />;
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

  const active = versions.find((v) => v.id === activeId) ?? null;
  // A saved variant is a JSON snapshot; a corrupt one falls back to live
  // rather than blanking the page.
  const shown: CvSnapshotData = (() => {
    if (!active) return { profile, workExperience: workExp, education, languages };
    try {
      return JSON.parse(active.snapshot) as CvSnapshotData;
    } catch {
      return { profile, workExperience: workExp, education, languages };
    }
  })();

  const saveVariant = (name: string) => {
    setVersionBusy(true);
    api
      .create<CvVersion>("cv-versions", {
        name,
        snapshot: JSON.stringify({
          profile,
          workExperience: workExp,
          education,
          languages,
        }),
      })
      .then(() => loadVersions())
      .then(() => notify(t("cvVersions.saved")))
      .catch((e) => onError((e as Error).message))
      .finally(() => setVersionBusy(false));
  };

  const deleteVariant = (v: CvVersion) => {
    setVersionBusy(true);
    Promise.resolve(api.remove("cv-versions", v.id))
      .then(() => {
        if (activeId === v.id) setActiveId(null);
        return loadVersions();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setVersionBusy(false));
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
    // Whatever is on the plate is what downloads — otherwise picking a
    // variant would preview one CV and export another.
    const cvData = shown;
    const doc =
      template === "two-column"
        ? generateCvPdfTwoColumn(cvData, labels)
        : generateCvPdf(cvData, labels);
    const base = shown.profile?.name
      ? shown.profile.name.replace(/\s+/g, "-")
      : "CV";
    const filename = active
      ? `${base}-${active.name.replace(/\s+/g, "-")}.pdf`
      : `${base}-CV.pdf`;
    doc.save(filename);
  };

  return (
    <section className="cv-tab">
      {/* The CV mounts the same way an application does (#535 shell): a card
          on a plate, the tools hanging off the plate's edges as its siblings,
          the actions on the plate under the card. What differs is the rail —
          here it lists the variants, because picking one is how you look at
          it. */}
      <div className="cv-stage">
        <div className="cv-tools cv-tools-left">
          <button
            type="button"
            className={`cv-tool${template === "single-column" ? " current" : ""}`}
            aria-pressed={template === "single-column"}
            title={t("cv.templateSingle")}
            aria-label={t("cv.templateSingle")}
            onClick={() => setTemplate("single-column")}
          >
            <span className="cv-template-thumb cv-template-thumb-single">
              <span className="cv-t-line" />
              <span className="cv-t-line" />
              <span className="cv-t-line short" />
            </span>
          </button>
          <button
            type="button"
            className={`cv-tool${template === "two-column" ? " current" : ""}`}
            aria-pressed={template === "two-column"}
            title={t("cv.templateTwoColumn")}
            aria-label={t("cv.templateTwoColumn")}
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
          </button>
        </div>

        <div className="cv-plate">
          <article className="cv-card">
            <div className="cv-pill">
              <span className="cv-pill-kind">{t("tabs.cv")}</span>
              <span className="cv-pill-name">
                {active ? active.name : t("cvVersions.live")}
              </span>
            </div>
            <div className="cv-card-cols">
              <div className="cv-doc-view" aria-label={t("cv.livePreview")}>
                <CvPreview
                  profile={shown.profile}
                  workExperience={shown.workExperience}
                  education={shown.education}
                  languages={shown.languages}
                  template={template}
                  labels={cvLabels}
                />
              </div>
              <CvVariantRail
                versions={versions}
                activeId={activeId}
                onSelect={setActiveId}
                onSave={saveVariant}
                onDelete={deleteVariant}
                busy={versionBusy}
              />
            </div>
            {/* What used to be the "at a glance" panel: the same counts, on
                the document they describe. */}
            <div className="cv-card-foot">
              <span>
                {t("cv.profile")}{" "}
                <b>
                  {
                    [shown.profile?.name, shown.profile?.email, shown.profile?.summary].filter(
                      Boolean,
                    ).length
                  }
                  /3
                </b>
              </span>
              <span>
                {t("cv.workExperience")} <b>{shown.workExperience.length}</b>
              </span>
              <span>
                {t("cv.education")} <b>{shown.education.length}</b>
              </span>
              <span>
                {t("cv.languages")} <b>{shown.languages.length}</b>
              </span>
            </div>
          </article>

          <div className="cv-plate-actions">
            <Button variant="primary" onClick={downloadPdf}>
              {t("cv.downloadPdf")}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                document
                  .getElementById("cv-builder")
                  ?.scrollIntoView({ block: "start" })
              }
            >
              {t("cv.editBelow")}
            </Button>
          </div>
        </div>

        <div className="cv-tools cv-tools-right">
          <button
            type="button"
            className="cv-tool"
            title={t("cv.downloadPdf")}
            aria-label={t("cv.downloadPdf")}
            onClick={downloadPdf}
          >
            <PrintIcon />
          </button>
        </div>
      </div>

      <div className="cv-layout" id="cv-builder">
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
      </div>
    </section>
  );
}
