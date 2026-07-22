import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { Document } from "../types";
import { RemoveIcon } from "../icons";
import { requestConfirm } from "../hooks";
import "./Documents.css";

// Extracted verbatim from detail.tsx (the application detail's document
// list: upload form + list of uploaded files with delete) as part of the
// #285 App.tsx/detail.tsx split — self-contained except .tl-del/.tl-empty,
// shared with Timeline (src/timeline.tsx) and kept as-is. Documents.css
// reproduces the App.css .docs*/.upload-btn/.doc-label/.doc-size recipe
// under the .zui-docs* names this component emits.
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

export interface DocumentsProps {
  applicationId: number;
  onError: (message: string | null) => void;
}

export function Documents({ applicationId, onError }: DocumentsProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Document[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api
        .documents(applicationId)
        .then(setItems)
        .catch((e) => onError((e as Error).message)),
    [applicationId, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const upload = (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    api
      .uploadDocument(applicationId, file, label || null)
      .then(() => {
        setLabel("");
        return load();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="zui-docs">
      <div className="zui-docs-add">
        <input
          placeholder={t("documents.labelPlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className={`zui-docs-upload-btn${busy ? " busy" : ""}`}>
          {busy ? t("documents.uploading") : t("detail.attachFile")}
          <input
            type="file"
            hidden
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <ul className="zui-docs-items">
        {(items ?? []).map((d) => (
          <li key={d.id}>
            <a href={`/api/documents/${d.id}/download`} download>
              {d.filename}
            </a>
            {d.label && <span className="zui-doc-label">{d.label}</span>}
            <span className="zui-doc-size">{formatSize(d.size)}</span>
            <button
              className="tl-del danger"
              aria-label={t("common.delete")}
              onClick={async () => {
                if (
                  await requestConfirm(
                    t("confirm.deleteDocument", { name: d.filename }),
                  )
                )
                  api
                    .remove("documents", d.id)
                    .then(load)
                    .catch((e) => onError((e as Error).message));
              }}
            >
              <RemoveIcon />
            </button>
          </li>
        ))}
        {items?.length === 0 && <li className="tl-empty">{t("detail.noFiles")}</li>}
      </ul>
    </div>
  );
}
