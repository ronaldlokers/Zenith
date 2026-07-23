// The quick-add job dialog (#285 split from chrome.tsx). Lead path is now
// paste-a-link (#482): drop a posting URL and it pulls the title, company and
// source via the existing importer, so the common case is near-zero typing.
// Manual entry is the fallback and needs only a title. Not self-contained-
// styled — composes Dialog + the shared .settings-field form layer in App.css.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { Application, Company, Status } from "../types";
import { STATUSES } from "../types";
import { Dialog } from "../ui";
import { ActionBar } from "./ActionBar";
import { Button } from "./Button";

export interface QuickAddDialogProps {
  companies: Company[];
  onClose: () => void;
  onCreated: (app: Application, open: boolean) => void;
  onError: (message: string | null) => void;
}

export function QuickAddDialog({
  companies,
  onClose,
  onCreated,
  onError,
}: QuickAddDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("interested");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extraCompanies, setExtraCompanies] = useState<Company[]>([]);

  const allCompanies = useMemo(
    () => [...companies, ...extraCompanies],
    [companies, extraCompanies],
  );

  // Fetch the posting and pre-fill title + company (find-or-created); the URL
  // itself is kept as the application's link. Only fills empty fields.
  const importFromUrl = async () => {
    const u = url.trim();
    if (!u || importing) return;
    setImporting(true);
    try {
      const r = await api.importUrl(u);
      if (r.title) setTitle((cur) => cur || r.title!);
      if (r.company) {
        const existing = allCompanies.find(
          (c) => c.name.toLowerCase() === r.company!.toLowerCase(),
        );
        if (existing) {
          setCompanyId(existing.id);
        } else {
          const created = await api.create<Company>("companies", {
            name: r.company,
            location: r.location,
          });
          setExtraCompanies((x) => [...x, created]);
          setCompanyId(created.id);
        }
      }
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const submit = (open: boolean) => {
    if (!title.trim() || busy) return;
    setBusy(true);
    api
      .create<Application>("applications", {
        title: title.trim(),
        company_id: companyId,
        url: url.trim() || null,
        status,
      })
      .then((a) => onCreated(a, open))
      .catch((e) => {
        onError((e as Error).message);
        setBusy(false);
      });
  };

  return (
    <Dialog label={t("quickAdd.title")} onClose={onClose}>
      <h2>{t("quickAdd.title")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(true);
        }}
      >
        <label className="settings-field">
          <span>{t("quickAdd.pasteLink")}</span>
          <div className="quickadd-import-row">
            <input
              autoFocus
              type="url"
              placeholder={t("quickAdd.pasteLinkPlaceholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void importFromUrl();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!url.trim() || importing}
              onClick={importFromUrl}
            >
              {importing ? t("quickAdd.importing") : t("quickAdd.import")}
            </Button>
          </div>
        </label>
        <p className="quickadd-hint muted small">{t("quickAdd.hint")}</p>

        <label className="settings-field">
          <span>{t("forms.title")}</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="settings-field">
          <span>{t("forms.company")}</span>
          <select
            value={companyId ?? ""}
            onChange={(e) =>
              setCompanyId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">—</option>
            {allCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          <span>{t("detail.status")}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            {STATUSES.map((st) => (
              <option key={st} value={st}>
                {t(`stages.${st}`)}
              </option>
            ))}
          </select>
        </label>
        <ActionBar variant="form">
          <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
            {t("quickAdd.addOpen")}
          </Button>
          <Button type="button" variant="secondary" disabled={busy || !title.trim()} onClick={() => submit(false)}>
            {t("quickAdd.add")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </ActionBar>
      </form>
    </Dialog>
  );
}
