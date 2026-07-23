// CV builder extracted from App.tsx (#285 split) — the CV tab and its
// profile / work-experience / education / languages sections + forms.
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { LoadingSkeleton } from "./ui";
import { useSubmitGuard } from "./hooks";
import { EmptyCvIcon, RemoveIcon } from "./icons";
import { ActionBar, Button, Chip, CvItem, EmptyState, SideList } from "./components";
import type {
  Education,
  Language,
  Profile,
  WorkExperience,
} from "./types";
import { formatMonthYear, getCvLanguage } from "./format";

export function CVTab({
  onError,
  notify,
}: {
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t, i18n } = useTranslation();
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
          />
          <ProfileSection
            profile={profile}
            onChanged={load}
            onError={onError}
            notify={notify}
          />
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

// AI CV tailoring (BYO Claude key): paste a job description, get suggested
// rewrites of the summary + each role, apply the ones you want. Calls Claude
// under the user's own key via /api/ai/tailor-cv.
function TailorPanel({
  profile,
  workExp,
  onApplied,
  onError,
  notify,
}: {
  profile: Profile;
  workExp: WorkExperience[];
  onApplied: () => Promise<unknown> | void;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    summary: string;
    experiences: { id: number; description: string }[];
  } | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const suggest = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setApplied(new Set());
    try {
      setResult(await api.tailorCv(jd.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applySummary = async (summary: string) => {
    try {
      await api.updateProfile({ summary });
      setApplied((s) => new Set(s).add("summary"));
      notify(t("cv.tailorApplied"));
      await onApplied();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const applyExperience = async (id: number, description: string) => {
    const item = workExp.find((w) => w.id === id);
    if (!item) return;
    try {
      await api.update("work-experience", id, { ...item, description });
      setApplied((s) => new Set(s).add(`exp-${id}`));
      notify(t("cv.tailorApplied"));
      await onApplied();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  return (
    <section className="cv-tailor">
      <h3>{t("cv.tailorTitle")}</h3>
      <p className="muted small">{t("cv.tailorHint")}</p>
      <textarea
        className="cv-tailor-input"
        rows={4}
        placeholder={t("cv.tailorPlaceholder")}
        value={jd}
        onChange={(e) => setJd(e.target.value)}
      />
      {error && <p className="login-error">{error}</p>}
      <button
        type="button"
        className="cv-tailor-go"
        disabled={busy || jd.trim().length < 20}
        onClick={suggest}
      >
        {busy ? t("cv.tailorWorking") : t("cv.tailorSuggest")}
      </button>
      {result && (
        <div className="cv-tailor-results">
          {result.summary && (
            <div className="cv-tailor-item">
              <span className="cv-tailor-label">{t("cv.tailorSummary")}</span>
              <p className="cv-tailor-before">
                {profile.summary || t("cv.tailorNoCurrent")}
              </p>
              <p className="cv-tailor-after">{result.summary}</p>
              <button
                type="button"
                disabled={applied.has("summary")}
                onClick={() => applySummary(result.summary)}
              >
                {applied.has("summary")
                  ? t("cv.tailorAppliedShort")
                  : t("cv.tailorApply")}
              </button>
            </div>
          )}
          {result.experiences.map((ex) => {
            const item = workExp.find((w) => w.id === ex.id);
            return (
              <div className="cv-tailor-item" key={ex.id}>
                <span className="cv-tailor-label">
                  {item ? `${item.title} · ${item.company}` : t("cv.workExperience")}
                </span>
                <p className="cv-tailor-before">
                  {item?.description || t("cv.tailorNoCurrent")}
                </p>
                <p className="cv-tailor-after">{ex.description}</p>
                <button
                  type="button"
                  disabled={applied.has(`exp-${ex.id}`)}
                  onClick={() => applyExperience(ex.id, ex.description)}
                >
                  {applied.has(`exp-${ex.id}`)
                    ? t("cv.tailorAppliedShort")
                    : t("cv.tailorApply")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type CvLabels = {
  present: string;
  workExperience: string;
  education: string;
  languages: string;
  skills: string;
  proficiency: Record<Language["proficiency"], string>;
};

// Recency sort shared by work + education (most recent first).
function cvSortRecent(
  a: { start_year: number | null; start_month: number | null },
  b: { start_year: number | null; start_month: number | null },
) {
  return (
    (b.start_year ?? 0) - (a.start_year ?? 0) ||
    (b.start_month ?? 0) - (a.start_month ?? 0)
  );
}

// Styled HTML mirror of the two PDF templates (#386) — renders straight from
// state so the preview updates live without a PDF blob (and without the
// browser's PDF-viewer chrome). The exported PDF stays the source of truth for
// print; this matches its content and section order.
function CvPreview({
  profile,
  workExperience,
  education,
  languages,
  template,
  labels,
}: {
  profile: Profile;
  workExperience: WorkExperience[];
  education: Education[];
  languages: Language[];
  template: string;
  labels: CvLabels;
}) {
  const contact = [profile.email, profile.phone, profile.location]
    .filter(Boolean)
    .join(" · ");
  const links = [profile.linkedin, profile.github, profile.portfolio].filter(
    Boolean,
  ) as string[];
  const work = [...workExperience].sort(
    (a, b) => Number(b.is_current) - Number(a.is_current) || cvSortRecent(a, b),
  );
  const edu = [...education].sort(cvSortRecent);
  const skills = [
    ...new Set(workExperience.flatMap((w) => w.skills.map((s) => s.name))),
  ];
  const workRange = (w: WorkExperience) =>
    `${formatMonthYear(w.start_month, w.start_year)} – ${
      w.is_current ? labels.present : formatMonthYear(w.end_month, w.end_year)
    }`;
  const eduRange = (e: Education) =>
    `${formatMonthYear(e.start_month, e.start_year)} – ${formatMonthYear(
      e.end_month,
      e.end_year,
    )}`;
  const eduTitle = (e: Education) =>
    [[e.degree, e.field].filter(Boolean).join(", "), e.institution]
      .filter(Boolean)
      .join(" — ");
  const langLine = languages
    .map((l) => `${l.name} (${labels.proficiency[l.proficiency]})`)
    .join(", ");

  const workSection = work.length > 0 && (
    <section className="cv-doc-sec">
      <h2>{labels.workExperience}</h2>
      {work.map((w) => (
        <div key={w.id} className="cv-doc-item">
          <div className="cv-doc-item-head">
            <span className="cv-doc-item-title">
              {w.title} — {w.company}
            </span>
            <span className="cv-doc-item-range">{workRange(w)}</span>
          </div>
          {w.description && (
            <p className="cv-doc-item-desc">{w.description}</p>
          )}
          {w.skills.length > 0 && (
            <p className="cv-doc-item-skills">
              {w.skills.map((s) => s.name).join(", ")}
            </p>
          )}
        </div>
      ))}
    </section>
  );
  const eduSection = edu.length > 0 && (
    <section className="cv-doc-sec">
      <h2>{labels.education}</h2>
      {edu.map((e) => (
        <div key={e.id} className="cv-doc-item">
          <div className="cv-doc-item-head">
            <span className="cv-doc-item-title">{eduTitle(e)}</span>
            <span className="cv-doc-item-range">{eduRange(e)}</span>
          </div>
        </div>
      ))}
    </section>
  );

  if (template === "two-column") {
    return (
      <article className="cv-doc cv-doc-2col">
        <aside className="cv-doc-aside">
          <h1 className="cv-doc-name">{profile.name || "—"}</h1>
          {contact && <p className="cv-doc-contact">{contact}</p>}
          {links.length > 0 && (
            <div className="cv-doc-aside-links">
              {links.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          )}
          {skills.length > 0 && (
            <div className="cv-doc-aside-sec">
              <h3>{labels.skills}</h3>
              <p>{skills.join(", ")}</p>
            </div>
          )}
          {languages.length > 0 && (
            <div className="cv-doc-aside-sec">
              <h3>{labels.languages}</h3>
              <p>{langLine}</p>
            </div>
          )}
        </aside>
        <div className="cv-doc-main">
          {profile.summary && (
            <p className="cv-doc-summary">{profile.summary}</p>
          )}
          {workSection}
          {eduSection}
        </div>
      </article>
    );
  }

  return (
    <article className="cv-doc">
      <header className="cv-doc-head">
        <h1 className="cv-doc-name">{profile.name || "—"}</h1>
        {contact && <p className="cv-doc-contact">{contact}</p>}
        {links.length > 0 && (
          <p className="cv-doc-links">{links.join(" · ")}</p>
        )}
      </header>
      {profile.summary && <p className="cv-doc-summary">{profile.summary}</p>}
      {workSection}
      {eduSection}
      {languages.length > 0 && (
        <section className="cv-doc-sec">
          <h2>{labels.languages}</h2>
          <p className="cv-doc-langs">{langLine}</p>
        </section>
      )}
    </article>
  );
}

function ProfileSection({
  profile,
  onChanged,
  onError,
  notify,
}: {
  profile: Profile;
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(profile);
  const set = (patch: Partial<Profile>) => setForm((f) => ({ ...f, ...patch }));

  const [submitting, submit] = useSubmitGuard(async () => {
    await api
      .updateProfile(form)
      .then(() => {
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  });
  const save = (e: FormEvent) => {
    e.preventDefault();
    submit(undefined);
  };

  return (
    <form className="form" onSubmit={save}>
      <div className="form-group">
        <h4>{t("cv.profile")}</h4>
        <label>
          {t("cv.name")}
          <input value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          {t("cv.email")}
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => set({ email: e.target.value })}
          />
        </label>
        <label>
          {t("cv.phone")}
          <input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
        </label>
        <label>
          {t("cv.location")}
          <input
            value={form.location ?? ""}
            onChange={(e) => set({ location: e.target.value })}
          />
        </label>
        <label>
          {t("cv.linkedin")}
          <input
            type="url"
            value={form.linkedin ?? ""}
            onChange={(e) => set({ linkedin: e.target.value })}
          />
        </label>
        <label>
          {t("cv.github")}
          <input
            type="url"
            value={form.github ?? ""}
            onChange={(e) => set({ github: e.target.value })}
          />
        </label>
        <label>
          {t("cv.portfolio")}
          <input
            type="url"
            value={form.portfolio ?? ""}
            onChange={(e) => set({ portfolio: e.target.value })}
          />
        </label>
        <label className="full">
          {t("cv.summary")}
          <textarea
            rows={3}
            value={form.summary ?? ""}
            onChange={(e) => set({ summary: e.target.value })}
          />
        </label>
      </div>
      <ActionBar variant="form">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
        </Button>
      </ActionBar>
    </form>
  );
}

function WorkExperienceForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: WorkExperience | null;
  onSubmit: (data: Partial<WorkExperience>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<WorkExperience>>(initial ?? {});
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<WorkExperience>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <label>
        {t("cv.company")} *
        <input
          required
          value={form.company ?? ""}
          onChange={(e) => set({ company: e.target.value })}
        />
      </label>
      <label>
        {t("cv.jobTitle")} *
        <input
          required
          value={form.title ?? ""}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <label>
        {t("cv.startMonth")}
        <input
          type="number"
          min={1}
          max={12}
          value={form.start_month ?? ""}
          onChange={(e) =>
            set({ start_month: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label>
        {t("cv.startYear")}
        <input
          type="number"
          value={form.start_year ?? ""}
          onChange={(e) =>
            set({ start_year: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!form.is_current}
          onChange={(e) => set({ is_current: e.target.checked ? 1 : 0 })}
        />
        {t("cv.current")}
      </label>
      {!form.is_current && (
        <>
          <label>
            {t("cv.endMonth")}
            <input
              type="number"
              min={1}
              max={12}
              value={form.end_month ?? ""}
              onChange={(e) =>
                set({ end_month: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
          <label>
            {t("cv.endYear")}
            <input
              type="number"
              value={form.end_year ?? ""}
              onChange={(e) =>
                set({ end_year: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
        </>
      )}
      <label className="full">
        {t("cv.description")}
        <textarea
          rows={3}
          value={form.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>
      <ActionBar variant="form">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </ActionBar>
    </form>
  );
}

function WorkExperienceSection({
  items,
  onChanged,
  onError,
  notify,
}: {
  items: WorkExperience[];
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<WorkExperience | "new" | null>(null);
  const [newSkill, setNewSkill] = useState<Record<number, string>>({});

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  const addSkill = (workExperienceId: number) => {
    const name = (newSkill[workExperienceId] ?? "").trim();
    if (!name) return;
    api
      .addWorkExperienceSkill(workExperienceId, name)
      .then(() => {
        setNewSkill((m) => ({ ...m, [workExperienceId]: "" }));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  const move = (index: number, dir: -1 | 1) => {
    const other = items[index + dir];
    const item = items[index];
    if (!other) return;
    Promise.all([
      api.update("work-experience", item.id, { ...item, sort_order: other.sort_order }),
      api.update("work-experience", other.id, { ...other, sort_order: item.sort_order }),
    ])
      .then(onChanged)
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="cv-section">
      <h3 className="detail-sub">{t("cv.workExperience")}</h3>
      <ul className="cv-list">
        {items.map((w, i) => (
          <CvItem key={w.id}>
            <div className="cv-item-head">
              <div>
                <strong>{w.title}</strong> — {w.company}
                <div className="muted small">
                  {formatMonthYear(w.start_month, w.start_year)} –{" "}
                  {w.is_current
                    ? t("cv.present")
                    : formatMonthYear(w.end_month, w.end_year)}
                </div>
              </div>
              <div className="cv-item-actions">
                <button
                  aria-label={t("cv.moveUp")}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={t("cv.moveDown")}
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button onClick={() => setEditing(w)}>{t("common.edit")}</button>
                <button
                  className="danger"
                  onClick={() =>
                    api
                      .remove("work-experience", w.id)
                      .then(onChanged)
                      .catch((e) => onError((e as Error).message))
                  }
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
            {w.description && <p className="notes">{w.description}</p>}
            <div className="keyword-chips">
              {w.skills.map((s) => (
                <Chip key={s.id}>
                  {s.name}
                  <button
                    onClick={() =>
                      api
                        .removeWorkExperienceSkill(w.id, s.id)
                        .then(onChanged)
                        .catch((e) => onError((e as Error).message))
                    }
                    aria-label={t("feedSettings.removeKeyword")}
                  >
                    <RemoveIcon />
                  </button>
                </Chip>
              ))}
              <input
                placeholder={t("cv.addSkill")}
                value={newSkill[w.id] ?? ""}
                onChange={(e) =>
                  setNewSkill((m) => ({ ...m, [w.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill(w.id);
                  }
                }}
              />
            </div>
            {editing !== "new" && editing?.id === w.id && (
              <WorkExperienceForm
                initial={editing}
                onCancel={() => setEditing(null)}
                onSubmit={(data) =>
                  run(() => api.update("work-experience", w.id, data))
                }
              />
            )}
          </CvItem>
        ))}
        {items.length === 0 && (
          <EmptyState as="li">
            <EmptyCvIcon />
            {t("cv.noWorkExperience")}
          </EmptyState>
        )}
      </ul>
      {editing === "new" ? (
        <WorkExperienceForm
          initial={null}
          onCancel={() => setEditing(null)}
          onSubmit={(data) => run(() => api.create("work-experience", data))}
        />
      ) : (
        <button className="btn-secondary" onClick={() => setEditing("new")}>
          {t("cv.addWorkExperience")}
        </button>
      )}
    </div>
  );
}

function EducationForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Education | null;
  onSubmit: (data: Partial<Education>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Education>>(initial ?? {});
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<Education>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <label>
        {t("cv.institution")} *
        <input
          required
          value={form.institution ?? ""}
          onChange={(e) => set({ institution: e.target.value })}
        />
      </label>
      <label>
        {t("cv.degree")}
        <input
          value={form.degree ?? ""}
          onChange={(e) => set({ degree: e.target.value })}
        />
      </label>
      <label>
        {t("cv.field")}
        <input
          value={form.field ?? ""}
          onChange={(e) => set({ field: e.target.value })}
        />
      </label>
      <label>
        {t("cv.startYear")}
        <input
          type="number"
          value={form.start_year ?? ""}
          onChange={(e) =>
            set({ start_year: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label>
        {t("cv.endYear")}
        <input
          type="number"
          value={form.end_year ?? ""}
          onChange={(e) =>
            set({ end_year: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <ActionBar variant="form">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </ActionBar>
    </form>
  );
}

function EducationSection({
  items,
  onChanged,
  onError,
  notify,
}: {
  items: Education[];
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Education | "new" | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  const move = (index: number, dir: -1 | 1) => {
    const other = items[index + dir];
    const item = items[index];
    if (!other) return;
    Promise.all([
      api.update("education", item.id, { ...item, sort_order: other.sort_order }),
      api.update("education", other.id, { ...other, sort_order: item.sort_order }),
    ])
      .then(onChanged)
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="cv-section">
      <h3 className="detail-sub">{t("cv.education")}</h3>
      <ul className="cv-list">
        {items.map((ed, i) => (
          <CvItem key={ed.id}>
            <div className="cv-item-head">
              <div>
                <strong>{ed.institution}</strong>
                {ed.degree ? ` — ${ed.degree}` : ""}
                {ed.field ? ` (${ed.field})` : ""}
                <div className="muted small">
                  {formatMonthYear(ed.start_month, ed.start_year)} –{" "}
                  {formatMonthYear(ed.end_month, ed.end_year)}
                </div>
              </div>
              <div className="cv-item-actions">
                <button
                  aria-label={t("cv.moveUp")}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={t("cv.moveDown")}
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button onClick={() => setEditing(ed)}>{t("common.edit")}</button>
                <button
                  className="danger"
                  onClick={() =>
                    api
                      .remove("education", ed.id)
                      .then(onChanged)
                      .catch((e) => onError((e as Error).message))
                  }
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
            {editing !== "new" && editing?.id === ed.id && (
              <EducationForm
                initial={editing}
                onCancel={() => setEditing(null)}
                onSubmit={(data) => run(() => api.update("education", ed.id, data))}
              />
            )}
          </CvItem>
        ))}
        {items.length === 0 && <EmptyState as="li">{t("cv.noEducation")}</EmptyState>}
      </ul>
      {editing === "new" ? (
        <EducationForm
          initial={null}
          onCancel={() => setEditing(null)}
          onSubmit={(data) => run(() => api.create("education", data))}
        />
      ) : (
        <button className="btn-secondary" onClick={() => setEditing("new")}>
          {t("cv.addEducation")}
        </button>
      )}
    </div>
  );
}

function LanguagesSection({
  items,
  onChanged,
  onError,
  notify,
}: {
  items: Language[];
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [proficiency, setProficiency] =
    useState<Language["proficiency"]>("conversational");

  const addLanguage = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    api
      .create("languages", { name: name.trim(), proficiency })
      .then(() => {
        setName("");
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="cv-section">
      <h3 className="detail-sub">{t("cv.languages")}</h3>
      <ul className="settings-list">
        {items.map((l) => (
          <li key={l.id}>
            <span>
              {l.name} — {t(`cv.proficiency.${l.proficiency}`)}
            </span>
            <button
              className="danger"
              onClick={() =>
                api
                  .remove("languages", l.id)
                  .then(onChanged)
                  .catch((e) => onError((e as Error).message))
              }
            >
              <RemoveIcon />
            </button>
          </li>
        ))}
        {items.length === 0 && <EmptyState as="li">{t("cv.noLanguages")}</EmptyState>}
      </ul>
      <form className="settings-add" onSubmit={addLanguage}>
        <input
          placeholder={t("cv.languageName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          value={proficiency}
          onChange={(e) =>
            setProficiency(e.target.value as Language["proficiency"])
          }
        >
          <option value="conversational">{t("cv.proficiency.conversational")}</option>
          <option value="fluent">{t("cv.proficiency.fluent")}</option>
          <option value="native">{t("cv.proficiency.native")}</option>
        </select>
        <button type="submit" className="btn-secondary">
          {t("feedSettings.add")}
        </button>
      </form>
    </div>
  );
}
