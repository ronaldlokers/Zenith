import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { Profile, Skill, WorkExperience } from "../types";
import { atsReport } from "../ats-score";
import { Chip } from "./Chip";
import "./JdKeywordMatch.css";

// The application-detail "ATS check" panel: paste a job description and score
// the built CV against it (#470). Grew out of the earlier JD keyword-match
// (#285 split): keyword coverage still drives it, now wrapped in a scored
// report (band ring + content checks) via the pure atsReport helper.
// JdKeywordMatch.css reproduces the App.css .jd-match-* recipe under the
// .zui-jd-match-* names this component emits.
export interface JdKeywordMatchProps {
  onError: (message: string | null) => void;
  initialText?: string;
}

export function JdKeywordMatch({ onError, initialText }: JdKeywordMatchProps) {
  const { t } = useTranslation();
  const [jdText, setJdText] = useState(initialText ?? "");
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [workExp, setWorkExp] = useState<WorkExperience[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = () => {
    if (skills) return;
    Promise.all([
      api.list<Skill>("skills"),
      api.list<WorkExperience>("work-experience"),
      api.profile(),
    ])
      .then(([allSkills, work, prof]) => {
        setSkills(allSkills);
        setWorkExp(work);
        setProfile(prof);
      })
      .catch((e) => onError((e as Error).message));
  };

  useEffect(() => {
    if (initialText) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report =
    jdText.trim() && skills && workExp
      ? atsReport(jdText, skills, workExp, profile)
      : null;
  const total = report ? report.matched.length + report.missing.length : 0;

  return (
    <div className="zui-jd-match">
      <textarea
        className="zui-jd-match-input"
        placeholder={t("detail.pasteJdPlaceholder")}
        value={jdText}
        onFocus={load}
        onChange={(e) => setJdText(e.target.value)}
        rows={4}
      />
      {report && (
        <div className="ats-report">
          <div className="ats-head">
            <span
              className="ats-ring"
              data-band={report.band}
              style={{ ["--pct" as string]: String(report.score) }}
              role="img"
              aria-label={t("ats.scoreAria", { score: report.score })}
            >
              <span className="ats-ring-n">{report.score}</span>
            </span>
            <div className="ats-head-text">
              <strong className={`ats-verdict band-${report.band}`}>
                {t(`ats.band.${report.band}`)}
              </strong>
              <span className="muted small">
                {total > 0
                  ? t("ats.coverage", { matched: report.matched.length, total })
                  : t("ats.noKeywords")}
              </span>
            </div>
          </div>

          {total > 0 && (
            <div className="keyword-chips">
              {report.matched.map((name) => (
                <Chip key={`m-${name}`} matched>
                  {name}
                </Chip>
              ))}
              {report.missing.map((name) => (
                <Chip key={`x-${name}`}>{name}</Chip>
              ))}
            </div>
          )}

          <ul className="ats-checks">
            {report.checks.map((c) => (
              <li key={c.key} className={c.passed ? "ok" : "no"}>
                <span className="ats-check-mark" aria-hidden="true">
                  {c.passed ? "✓" : "○"}
                </span>
                {t(`ats.check.${c.key}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
