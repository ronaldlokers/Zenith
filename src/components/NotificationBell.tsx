import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { AppNotification } from "../types";
import { BellIcon } from "../icons";
import { formatDate } from "../format";
import { rowActivate, useFocusTrap } from "../hooks";
import "./NotificationBell.css";

// Extracted verbatim from chrome.tsx (the header notifications bell: a
// button with an unread dot that opens a backdrop + panel listing
// notifications) as part of the #285 App.tsx/chrome.tsx split —
// self-contained, except the trigger button keeps the shared `.settings-btn`
// class (App.css) also used by the top-bar settings button, and the "mark
// all read" button keeps the shared `.btn-secondary` class. Both stay in
// App.css. NotificationBell.css reproduces the App.css .notification-*
// recipe under the .zui-notification-* names this component emits.
//
// In-app notification center (#213) — due/overdue follow-ups, stale
// postings, and new Feed matches, generated server-side on the existing 6h
// cron (see worker/notifications.ts). Polled rather than pushed since
// there's no realtime transport in this app; a stale unread count for a few
// minutes is a fine tradeoff against adding one.
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
    <span className="zui-notification-bell">
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
          <span className="zui-notification-dot" aria-hidden="true">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="zui-notification-backdrop" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="zui-notification-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t("header.notifications")}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            <div className="zui-notification-panel-head">
              <span>{t("header.notifications")}</span>
              {unreadCount > 0 && (
                <button className="btn-secondary" onClick={markAllRead}>
                  {t("header.markAllRead")}
                </button>
              )}
            </div>
            <ul className="zui-notification-list">
              {(notifications ?? []).map((n) => (
                <li
                  key={n.id}
                  className={n.read_at ? "read" : "unread"}
                  {...rowActivate(() => openNotification(n))}
                >
                  <span className="zui-notification-title">{n.title}</span>
                  {n.body && <span className="muted small">{n.body}</span>}
                  <span className="muted small">{formatDate(n.created_at)}</span>
                </li>
              ))}
              {notifications && notifications.length === 0 && (
                <li className="zui-notification-empty muted small">
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
