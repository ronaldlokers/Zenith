// The detail page's "Prep" tab body (#479 clustering — interview prep + AI
// practice). Extracted from ApplicationDetailModal (src/detail.tsx): a
// self-contained JSX block that only reads the application and forwards
// onError — it does not write any parent state, unlike the Track tab (see
// that file's header comment for why Track stayed inline).
import { useTranslation } from "react-i18next";
import {
  AiKeyGate,
  InterviewPrepSection,
  MockInterview,
  NegotiationRoleplay,
} from "../components";
import type { Application } from "../types";

export function DetailPrepTab({
  application: a,
  onError,
}: {
  application: Application;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <h3 className="detail-sub detail-sub-first">
        {t("prep.title")}
      </h3>
      <InterviewPrepSection
        applicationId={a.id}
        onError={onError}
      />

      <h3 className="detail-sub">{t("detail.aiPractice")}</h3>
      <p
        className={`ai-grounding ${
          a.job_description
            ? "ai-grounding-ready"
            : "ai-grounding-missing"
        }`}
      >
        {a.job_description
          ? t("ai.groundedReady")
          : t("ai.groundedMissing")}
      </p>

      <h3 className="detail-sub">{t("mockInterview.title")}</h3>
      <AiKeyGate>
        <MockInterview
          title={a.title}
          company={a.company_name ?? null}
          jobDescription={a.job_description}
          onError={onError}
        />
      </AiKeyGate>

      <h3 className="detail-sub">{t("negotiation.title")}</h3>
      <AiKeyGate>
        <NegotiationRoleplay
          title={a.title}
          company={a.company_name ?? null}
          salaryExpectation={a.salary_range}
          jobDescription={a.job_description}
          onError={onError}
        />
      </AiKeyGate>
    </>
  );
}
