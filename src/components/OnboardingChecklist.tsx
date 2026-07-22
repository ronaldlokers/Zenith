import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import "./OnboardingChecklist.css";

// Extracted verbatim from chrome.tsx (the first-run onboarding panel: a
// dismiss header + a checklist of steps + a "load sample data" link) as
// part of the #285 App.tsx/chrome.tsx split — self-contained.
// OnboardingChecklist.css reproduces the App.css .onboarding* recipe under
// the .zui-onboarding* names this component emits.
export interface OnboardingChecklistProps {
  profileDone: boolean;
  companyDone: boolean;
  jobDone: boolean;
  onGoToProfile: () => void;
  onGoToCompanies: () => void;
  onAddJob: () => void;
  onDismiss: () => void;
  onLoadSample: () => void;
}

export function OnboardingChecklist({
  profileDone,
  companyDone,
  jobDone,
  onGoToProfile,
  onGoToCompanies,
  onAddJob,
  onDismiss,
  onLoadSample,
}: OnboardingChecklistProps) {
  const { t } = useTranslation();
  return (
    <div className="zui-onboarding">
      <div className="zui-onboarding-head">
        <h3>{t("onboarding.title")}</h3>
        <button
          className="zui-onboarding-dismiss"
          onClick={onDismiss}
          aria-label={t("common.close")}
        >
          ×
        </button>
      </div>
      <ul>
        <li className={profileDone ? "done" : ""}>
          <button onClick={onGoToProfile}>{t("onboarding.profile")}</button>
        </li>
        <li className={companyDone ? "done" : ""}>
          <button onClick={onGoToCompanies}>{t("onboarding.company")}</button>
        </li>
        <li className={jobDone ? "done" : ""}>
          <button onClick={onAddJob}>{t("onboarding.firstJob")}</button>
        </li>
      </ul>
      {!jobDone && (
        <Button variant="link" className="zui-onboarding-sample" onClick={onLoadSample}>
          {t("onboarding.sampleLink")}
        </Button>
      )}
    </div>
  );
}
