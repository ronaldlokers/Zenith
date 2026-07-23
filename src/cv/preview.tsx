// Live HTML CV preview (mirrors the PDF templates) + its sort helper.
// Split out of cv.tsx (#452).
import type { Education, Language, Profile, WorkExperience } from "../types";
import { formatMonthYear } from "../format";

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
export function CvPreview({
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
          <h2 className="cv-doc-name">{profile.name || "—"}</h2>
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
        <h2 className="cv-doc-name">{profile.name || "—"}</h2>
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

