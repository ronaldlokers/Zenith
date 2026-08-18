// The quick-add job dialog (#285 split from chrome.tsx). Lead path is now
// paste-a-link (#482): drop a posting URL and it pulls the title, company and
// source via the existing importer, so the common case is near-zero typing.
// Manual entry is the fallback and needs only a title.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { Application, Company, Status } from "../types";
import { STATUSES } from "../types";
import { Dialog } from "../ui";
import { ActionBar } from "./ActionBar";
import { Button } from "./Button";
import "./QuickAddDialog.css";

// A failed submit is the one moment the typed job is only in this component's
// state, and the advice for the commonest cause of one — an expired session —
// is "reload the page and sign in again", which discards exactly that. So the
// draft is written down when a submit fails and read back once on the next
// mount.
//
// Deliberately one-shot and failure-only. Persisting every keystroke would
// mean cancelling the dialog and opening it later hands back a job the person
// already decided against, which is a different and more annoying bug.
const DRAFT_KEY = "zenith_quickadd_draft";

interface Draft {
  title: string;
  companyId: number | null;
  url: string;
  status: Status;
}

function takeDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(DRAFT_KEY);
    const d = JSON.parse(raw) as Partial<Draft>;
    if (typeof d.title !== "string" || !d.title) return null;
    return {
      title: d.title,
      companyId: typeof d.companyId === "number" ? d.companyId : null,
      url: typeof d.url === "string" ? d.url : "",
      // Validated rather than trusted: the value is round-tripped through
      // storage a person can edit, and an unknown status reaches the board as
      // a column that does not exist.
      status: STATUSES.includes(d.status as Status)
        ? (d.status as Status)
        : "interested",
    };
  } catch {
    // Private mode, disabled storage, or malformed JSON. A lost draft is bad;
    // a dialog that throws on open is worse.
    return null;
  }
}

export interface QuickAddDialogProps {
  companies: Company[];
  /**
   * Values captured from a job posting (#61), which win over a restored
   * draft: someone arriving from the bookmarklet is adding the job they were
   * just looking at, not resuming an older one.
   */
  prefill?: { title?: string; company?: string; url?: string };
  // The stage to open on. The board's add block sets it to its own column;
  // everything else leaves it unset and gets "interested".
  initialStatus?: Status;
  onClose: () => void;
  onCreated: (app: Application, open: boolean) => void;
  onError: (message: string | null) => void;
}

export function QuickAddDialog({
  companies,
  prefill,
  initialStatus,
  onClose,
  onCreated,
  onError,
}: QuickAddDialogProps) {
  const { t } = useTranslation();
  const [restored] = useState(() => (prefill ? null : takeDraft()));
  const [title, setTitle] = useState(prefill?.title ?? restored?.title ?? "");
  const [companyId, setCompanyId] = useState<number | null>(() => {
    if (prefill?.company) {
      // Matched by name rather than created: a captured site name is a guess,
      // and quietly minting a company from it would leave the list full of
      // near-duplicates nobody chose to add.
      const hit = companies.find(
        (c) => c.name.toLowerCase() === prefill.company!.trim().toLowerCase(),
      );
      return hit?.id ?? null;
    }
    return restored?.companyId ?? null;
  });
  const [url, setUrl] = useState(prefill?.url ?? restored?.url ?? "");
  // The board's add block opens this against the column it sits in, so what
  // you add lands where you asked for it (#535).
  const [status, setStatus] = useState<Status>(
    restored?.status ?? initialStatus ?? "interested",
  );
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
        try {
          sessionStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ title: title.trim(), companyId, url: url.trim(), status }),
          );
        } catch {
          /* nothing can be kept; the dialog still holds it until reload */
        }
        onError((e as Error).message);
        setBusy(false);
      });
  };

  return (
    <Dialog label={t("quickAdd.title")} onClose={onClose}>
      <h2>{t("quickAdd.title")}</h2>
      {restored && (
        <p className="zui-quickadd-restored small" role="status">
          {t("quickAdd.draftRestored")}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(true);
        }}
      >
        <label className="zui-quickadd-field">
          <span>{t("quickAdd.pasteLink")}</span>
          <div className="zui-quickadd-import-row">
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
        <p className="zui-quickadd-hint muted small">{t("quickAdd.hint")}</p>

        <label className="zui-quickadd-field">
          <span>{t("forms.title")}</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="zui-quickadd-field">
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
        <label className="zui-quickadd-field">
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
