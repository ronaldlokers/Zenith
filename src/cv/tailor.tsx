// AI CV-tailoring panel. Split out of cv.tsx (#452).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { AiKeyGate } from "../components";
import type { Profile, WorkExperience } from "../types";

export function TailorPanel({
  profile,
  workExp,
  onApplied,
  onError,
  notify,
  initialJd,
}: {
  profile: Profile;
  workExp: WorkExperience[];
  onApplied: () => Promise<unknown> | void;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
  initialJd?: string;
}) {
  const { t } = useTranslation();
  // Seeded from an application's stored job description when arriving via
  // "Tailor CV for this job" (react-router navigation state).
  const [jd, setJd] = useState(initialJd ?? "");
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

  const applyAll = async () => {
    if (!result) return;
    try {
      if (result.summary) await api.updateProfile({ summary: result.summary });
      for (const ex of result.experiences) {
        const item = workExp.find((w) => w.id === ex.id);
        if (item) {
          await api.update("work-experience", ex.id, {
            ...item,
            description: ex.description,
          });
        }
      }
      setApplied(
        new Set(["summary", ...result.experiences.map((e) => `exp-${e.id}`)]),
      );
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
      <AiKeyGate>
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
          {(result.summary || result.experiences.length > 0) && (
            <button
              type="button"
              className="cv-tailor-apply-all"
              onClick={applyAll}
            >
              {t("cv.tailorApplyAll")}
            </button>
          )}
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
      </AiKeyGate>
    </section>
  );
}

