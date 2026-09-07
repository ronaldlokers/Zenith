// The detail page's "Tailor" tab body (#479 clustering — ATS keyword match +
// cover letter). Extracted from ApplicationDetailModal (src/detail.tsx): a
// self-contained JSX block whose closure is exactly the four values the
// extraction card named — application, onError, onChanged, notify — no
// parent state or setter involved.
import { useTranslation } from "react-i18next";
import { CoverLetterSection, JdKeywordMatch } from "../components";
import type { Application } from "../types";

export function DetailTailorTab({
  application: a,
  onChanged,
  onError,
  notify,
}: {
  application: Application;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <h3 className="detail-sub detail-sub-first">
        {t("detail.keywordMatch")}
      </h3>
      <JdKeywordMatch
        onError={onError}
        initialText={a.job_description ?? undefined}
      />

      <h3 className="detail-sub">{t("coverLetter.title")}</h3>
      <CoverLetterSection
        application={a}
        onChanged={onChanged}
        onError={onError}
        notify={notify}
      />
    </>
  );
}
