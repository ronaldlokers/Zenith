import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { AiKeyGate } from "../components";

// LinkedIn profile optimizer (#476). Paste in the current headline + About and
// get a stronger, CV-grounded rewrite plus tips — using the user's own
// Anthropic key. Suggestions only; nothing is written to LinkedIn. Reuses the
// .cv-tailor-* recipe for visual consistency with the CV tailoring panel.
export function LinkedInOptimizer({
  onError,
  notify,
}: {
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    headline: string;
    about: string;
    tips: string[];
  } | null>(null);

  const canRun = headline.trim().length + about.trim().length >= 15;

  const optimize = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await api.linkedinReview({
          headline: headline.trim(),
          about: about.trim(),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => notify(t("linkedin.copied")))
      .catch(() => onError(t("linkedin.copyFailed")));

  return (
    <section className="cv-tailor linkedin-opt">
      <h3>{t("linkedin.title")}</h3>
      <p className="muted small">{t("linkedin.hint")}</p>
      <AiKeyGate>
        <label className="linkedin-field">
          <span className="cv-tailor-label">{t("linkedin.headline")}</span>
          <input
            className="linkedin-input"
            value={headline}
            maxLength={220}
            placeholder={t("linkedin.headlinePlaceholder")}
            onChange={(e) => setHeadline(e.target.value)}
          />
        </label>
        <label className="linkedin-field">
          <span className="cv-tailor-label">{t("linkedin.about")}</span>
          <textarea
            className="cv-tailor-input"
            rows={5}
            value={about}
            placeholder={t("linkedin.aboutPlaceholder")}
            onChange={(e) => setAbout(e.target.value)}
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button
          type="button"
          className="cv-tailor-go"
          disabled={busy || !canRun}
          onClick={optimize}
        >
          {busy ? t("linkedin.working") : t("linkedin.optimize")}
        </button>
        {result && (
          <div className="cv-tailor-results">
            {result.headline && (
              <div className="cv-tailor-item">
                <span className="cv-tailor-label">
                  {t("linkedin.suggestedHeadline")}
                </span>
                <p className="linkedin-suggestion">{result.headline}</p>
                <button
                  type="button"
                  className="linkedin-copy"
                  onClick={() => copy(result.headline)}
                >
                  {t("linkedin.copy")}
                </button>
              </div>
            )}
            {result.about && (
              <div className="cv-tailor-item">
                <span className="cv-tailor-label">
                  {t("linkedin.suggestedAbout")}
                </span>
                <p className="linkedin-suggestion linkedin-about">
                  {result.about}
                </p>
                <button
                  type="button"
                  className="linkedin-copy"
                  onClick={() => copy(result.about)}
                >
                  {t("linkedin.copy")}
                </button>
              </div>
            )}
            {result.tips.length > 0 && (
              <div className="cv-tailor-item">
                <span className="cv-tailor-label">{t("linkedin.tips")}</span>
                <ul className="linkedin-tips">
                  {result.tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </AiKeyGate>
    </section>
  );
}
