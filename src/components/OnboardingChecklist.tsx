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
  feedDone: boolean;
  goalDone: boolean;
  onGoToProfile: () => void;
  onGoToCompanies: () => void;
  onAddJob: () => void;
  onGoToFeed: () => void;
  onSetGoal: () => void;
  onDismiss: () => void;
  onLoadSample: () => void;
}

export function OnboardingChecklist({
  profileDone,
  companyDone,
  jobDone,
  feedDone,
  goalDone,
  onGoToProfile,
  onGoToCompanies,
  onAddJob,
  onGoToFeed,
  onSetGoal,
  onDismiss,
  onLoadSample,
}: OnboardingChecklistProps) {
  const { t } = useTranslation();
  return (
    <div className="zui-onboarding">
      <div className="zui-onboarding-head">
        {/* h2, not h3. This sits directly under the page's h1 and the
            sections after it are h2, so an h3 here skips a level on the
            first screen a new account ever shows — which is exactly where
            heading navigation matters most. Caught only against an empty
            database: with data the checklist is gone. */}
        <h2>{t("onboarding.title")}</h2>
        <button
          className="zui-onboarding-dismiss"
          onClick={onDismiss}
          aria-label={t("common.close")}
        >
          ×
        </button>
      </div>
      <ul>
        {/* Job-first (#483): the fastest, most motivating first action —
            paste-a-link — leads; the weekly goal seeds the momentum system. */}
        <li className={jobDone ? "done" : ""}>
          <button onClick={onAddJob}>{t("onboarding.firstJob")}</button>
        </li>
        <li className={goalDone ? "done" : ""}>
          <button onClick={onSetGoal}>{t("onboarding.goal")}</button>
        </li>
        <li className={profileDone ? "done" : ""}>
          <button onClick={onGoToProfile}>{t("onboarding.profile")}</button>
        </li>
        <li className={companyDone ? "done" : ""}>
          <button onClick={onGoToCompanies}>{t("onboarding.company")}</button>
        </li>
        <li className={feedDone ? "done" : ""}>
          <button onClick={onGoToFeed}>{t("onboarding.feed")}</button>
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
