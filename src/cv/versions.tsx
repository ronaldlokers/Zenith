import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../format";
import type { CvVersion } from "../types";
import { Button } from "../components";
import "./cv.css";

// Named CV versions (#474) — a personal library of resume variants, saved as
// JSON snapshots and independent of later live edits.
//
// They are the rail on the CV plate now (#535 shell): picking one is how you
// look at it, so the list is the navigation rather than a drawer of download
// buttons. The state lives in the CV tab, because the document on the plate
// and the PDF it exports both have to follow the selection.
export function CvVariantRail({
  versions,
  activeId,
  onSelect,
  onSave,
  onDelete,
  busy,
}: {
  versions: CvVersion[];
  // null is the live builder state, which is always the first entry.
  activeId: number | null;
  onSelect: (id: number | null) => void;
  onSave: (name: string) => void;
  onDelete: (v: CvVersion) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const save = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName("");
    setNaming(false);
  };

  return (
    <div className="cv-rail" role="radiogroup" aria-label={t("cvVersions.title")}>
      <button
        type="button"
        role="radio"
        aria-checked={activeId === null}
        className={`cv-rail-step${activeId === null ? " current" : ""}`}
        onClick={() => onSelect(null)}
      >
        {t("cvVersions.live")}
      </button>
      {versions.map((v) => (
        <span className="cv-rail-row" key={v.id}>
          <button
            type="button"
            role="radio"
            aria-checked={activeId === v.id}
            className={`cv-rail-step${activeId === v.id ? " current" : ""}`}
            onClick={() => onSelect(v.id)}
          >
            {v.name}
            <span className="cv-rail-date">{formatDate(v.created_at)}</span>
          </button>
          <button
            type="button"
            className="cv-rail-del"
            aria-label={t("cvVersions.deleteAria", { name: v.name })}
            disabled={busy}
            onClick={() => onDelete(v)}
          >
            ×
          </button>
        </span>
      ))}
      {naming ? (
        <form
          className="cv-rail-new"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            autoFocus
            placeholder={t("cvVersions.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNaming(false);
            }}
          />
          <Button type="submit" variant="secondary" disabled={busy || !name.trim()}>
            {t("cvVersions.save")}
          </Button>
        </form>
      ) : (
        <button
          type="button"
          className="cv-rail-add"
          disabled={busy}
          onClick={() => setNaming(true)}
        >
          {t("cvVersions.newVariant")}
        </button>
      )}
    </div>
  );
}
