// App-shell chrome extracted from App.tsx (#285 split): the quick-add job
// dialog. Rendered by App(). The onboarding checklist, the ⌘K command
// palette, and the notification bell moved out to
// src/components/OnboardingChecklist.tsx, src/components/CommandPalette.tsx,
// and src/components/NotificationBell.tsx respectively.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import type { Application, Company, Status } from "./types";
import { STATUSES } from "./types";
import { Dialog } from "./ui";
import { ActionBar, Button } from "./components";

// Self-serve account deletion (#285) — GDPR right-to-erasure. Strong
// confirm, then wipe + sign out.

export function QuickAddDialog({
  companies,
  onClose,
  onCreated,
  onError,
}: {
  companies: Company[];
  onClose: () => void;
  onCreated: (app: Application, open: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("interested");
  const [busy, setBusy] = useState(false);

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
          <span>{t("forms.title")}</span>
          <input
            autoFocus
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
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          <span>{t("forms.url")}</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
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

// Overview home screen (#128) — the new landing tab, replacing "always
// opens on Jobs." One glanceable screen: a headline pipeline number, the
// existing next-actions panel, and a recent-activity list built from the
// same applications data already loaded app-wide (no extra fetch).
// One pipeline view (#314 follow-up): the Board, with the stage ring
// (funnel) and the filters on top. The separate list view is gone — the
// columns are the status filter and drag is the bulk status action.
