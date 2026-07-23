import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import i18n from "../i18n";
import { formatDate, getCvLanguage } from "../format";
import type { CvSnapshotData, CvVersion } from "../types";
import { Button } from "../components";

// Named CV versions (#474) — a personal library of resume variants. Saves a
// JSON snapshot of the current builder state; each can be downloaded as a PDF
// at any time, independent of later live edits. Non-destructive by design.
export function CvVersions({
  current,
  template,
  onError,
  notify,
}: {
  current: CvSnapshotData;
  template: "single-column" | "two-column";
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<CvVersion[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .list<CvVersion>("cv-versions")
      .then(setVersions)
      .catch((e) => onError((e as Error).message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    if (!name.trim()) return;
    setBusy(true);
    api
      .create<CvVersion>("cv-versions", {
        name: name.trim(),
        snapshot: JSON.stringify(current),
      })
      .then(() => {
        setName("");
        return load();
      })
      .then(() => notify(t("cvVersions.saved")))
      .catch((e) => onError((e as Error).message))
      .finally(() => setBusy(false));
  };

  const download = async (v: CvVersion) => {
    let data: CvSnapshotData;
    try {
      data = JSON.parse(v.snapshot) as CvSnapshotData;
    } catch {
      onError(t("cvVersions.corrupt"));
      return;
    }
    const { generateCvPdf, generateCvPdfTwoColumn } = await import("../pdf");
    const tCv = i18n.getFixedT(getCvLanguage(i18n.resolvedLanguage ?? "en"));
    const labels = {
      present: tCv("cv.present"),
      workExperience: tCv("cv.workExperience"),
      education: tCv("cv.education"),
      languages: tCv("cv.languages"),
      skills: tCv("cv.skills"),
    };
    const doc =
      template === "two-column"
        ? generateCvPdfTwoColumn(data, labels)
        : generateCvPdf(data, labels);
    const base = data.profile?.name
      ? data.profile.name.replace(/\s+/g, "-")
      : "CV";
    doc.save(`${base}-${v.name.replace(/\s+/g, "-")}.pdf`);
  };

  const remove = (v: CvVersion) => {
    setBusy(true);
    Promise.resolve(api.remove("cv-versions", v.id))
      .then(load)
      .catch((e) => onError((e as Error).message))
      .finally(() => setBusy(false));
  };

  if (!versions) return null;

  return (
    <div className="cv-versions">
      <div className="cv-versions-add">
        <input
          placeholder={t("cvVersions.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <Button variant="secondary" disabled={busy || !name.trim()} onClick={save}>
          {t("cvVersions.save")}
        </Button>
      </div>
      {versions.length === 0 ? (
        <p className="muted small">{t("cvVersions.empty")}</p>
      ) : (
        <ul className="cv-versions-list">
          {versions.map((v) => (
            <li key={v.id}>
              <span className="cv-version-name">{v.name}</span>
              <span className="cv-version-date muted small">
                {formatDate(v.created_at)}
              </span>
              <span className="cv-version-actions">
                <button onClick={() => download(v)}>
                  {t("cvVersions.download")}
                </button>
                <button className="danger" onClick={() => remove(v)}>
                  {t("common.delete")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
