import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { Application } from "../types";
import { Button } from "./Button";
import "./CoverLetterSection.css";

// Extracted verbatim from detail.tsx (the application detail's cover
// letter editor: generate-a-draft + save) as part of the #285
// App.tsx/detail.tsx split — self-contained. CoverLetterSection.css
// reproduces the App.css .cover-letter* recipe under the .zui-cover-letter*
// names this component emits.
export interface CoverLetterSectionProps {
  application: Application;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}

export function CoverLetterSection({
  application,
  onChanged,
  onError,
  notify,
}: CoverLetterSectionProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(application.cover_letter ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(application.cover_letter ?? "");
  }, [application.id, application.cover_letter]);

  const [generating, setGenerating] = useState(false);
  const generate = () => {
    if (generating) return;
    setGenerating(true);
    api
      .profile()
      .then((profile) => {
        const company = application.company_name ?? t("coverLetter.theCompany");
        const greeting = t("coverLetter.greeting", { company });
        const body = t("coverLetter.body", {
          title: application.title,
          company,
          summary: profile.summary ?? t("coverLetter.summaryPlaceholder"),
        });
        const signoff = t("coverLetter.signoff", {
          name: profile.name ?? t("coverLetter.namePlaceholder"),
        });
        setText(`${greeting}\n\n${body}\n\n${signoff}`);
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setGenerating(false));
  };

  const save = () => {
    setSaving(true);
    api
      .update("applications", application.id, { ...application, cover_letter: text })
      .then(() => {
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="zui-cover-letter">
      <div className="zui-cover-letter-actions">
        <Button
          variant="secondary"
          onClick={generate}
          disabled={generating}
          aria-busy={generating}
        >
          {generating
            ? t("coverLetter.generating")
            : t("coverLetter.generateDraft")}
        </Button>
        <Button variant="primary" disabled={saving} onClick={save}>
          {t("common.save")}
        </Button>
      </div>
      <textarea
        rows={10}
        placeholder={t("coverLetter.placeholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
