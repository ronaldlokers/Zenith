// App-shell chrome extracted from App.tsx (#285 split): the onboarding
// checklist, the notification bell, and the quick-add job dialog. All
// rendered by App(). The ⌘K command palette moved out to
// src/components/CommandPalette.tsx.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import type { Application, AppNotification, Company, Status } from "./types";
import { STATUSES } from "./types";
import { BellIcon } from "./icons";
import { formatDate } from "./format";
import { Dialog } from "./ui";
import { rowActivate, useFocusTrap } from "./hooks";
import { ActionBar, Button } from "./components";

// Self-serve account deletion (#285) — GDPR right-to-erasure. Strong
// confirm, then wipe + sign out.
// In-app notification center (#213) — due/overdue follow-ups, stale
// postings, and new Feed matches, generated server-side on the
// existing 6h cron (see worker/notifications.ts). Polled rather than
// pushed since there's no realtime transport in this app; a stale
// unread count for a few minutes is a fine tradeoff against adding one.
const NOTIFICATION_POLL_MS = 120_000;

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [open, setOpen] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  const load = useCallback(() => {
    api.notifications().then(setNotifications).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, NOTIFICATION_POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  const openNotification = (n: AppNotification) => {
    setOpen(false);
    if (!n.read_at) {
      api.markNotificationRead(n.id).then(load);
    }
    if (n.link) navigate(n.link);
  };

  const markAllRead = () => {
    api.markAllNotificationsRead().then(load);
  };

  return (
    <span className="notification-bell">
      <button
        className="settings-btn"
        onClick={() => setOpen((v) => !v)}
        title={t("header.notifications")}
        aria-label={
          unreadCount > 0
            ? t("header.notificationsUnread", { count: unreadCount })
            : t("header.notifications")
        }
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notification-dot" aria-hidden="true">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="notification-backdrop" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="notification-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t("header.notifications")}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            <div className="notification-panel-head">
              <span>{t("header.notifications")}</span>
              {unreadCount > 0 && (
                <button className="btn-secondary" onClick={markAllRead}>
                  {t("header.markAllRead")}
                </button>
              )}
            </div>
            <ul className="notification-list">
              {(notifications ?? []).map((n) => (
                <li
                  key={n.id}
                  className={n.read_at ? "read" : "unread"}
                  {...rowActivate(() => openNotification(n))}
                >
                  <span className="notification-title">{n.title}</span>
                  {n.body && <span className="muted small">{n.body}</span>}
                  <span className="muted small">{formatDate(n.created_at)}</span>
                </li>
              ))}
              {notifications && notifications.length === 0 && (
                <li className="notification-empty muted small">
                  {t("header.notificationsEmpty")}
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </span>
  );
}

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
