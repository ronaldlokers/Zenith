// App-shell chrome, lifted out of App.tsx (shell split). These are
// app-singletons, not reusable primitives: they keep their App.css classes
// (.side/.top/.tabs/.toast) because the shell is a layout grid — .app is a
// flex container at >=900px and .side/.top/.tabs are its participants, sized
// by .app:has(...) per-view rules. That context can't be reproduced in an
// isolated @layer component, so these stay plain and App.css keeps owning
// the layout. Presentation only; all state/wiring lives in App.
import { useTranslation } from "react-i18next";
import { Logo, SearchIcon, SettingsIcon } from "./icons";
import { NotificationBell } from "./components";
import { type Tab } from "./routing";
import { type Toast } from "./app-data";

export interface NavItem {
  data: string;
  to: Tab;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}

export function TopBar({
  scrolled,
  pageTitle,
  settingsActive,
  onOpenSettings,
  onOpenMenu,
}: {
  scrolled: boolean;
  pageTitle: string;
  settingsActive: boolean;
  onOpenSettings: () => void;
  /** Opens the destination menu (#535 shell). */
  onOpenMenu: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className={`top${scrolled ? " scrolled" : ""}`}>
      {/* The wordmark is the way into the destination menu (#535 shell).
          It is still the brand mark — it has simply stopped being inert. */}
      <button
        className="top-brand"
        onClick={onOpenMenu}
        aria-haspopup="menu"
        aria-label={t("menu.open")}
      >
        <Logo size={22} />
        <span>Zenith</span>
      </button>
      <h1 className="top-title">{pageTitle}</h1>
      <button
        className={`settings-btn top-settings${settingsActive ? " active" : ""}`}
        onClick={onOpenSettings}
        title={t("header.settings")}
        aria-label={t("header.settings")}
        aria-current={settingsActive ? "page" : undefined}
      >
        <SettingsIcon />
      </button>
    </header>
  );
}

// The persistent bottom bar (#535 shell). Three slots, always reachable,
// never scrolling away — the one piece of chrome that survives the rail's
// removal.
//
// The spec called these Pinned · Search · Notifications, borrowed from the
// reference. Zenith has no pinning, so the third slot is what the app
// actually has and what it is most often reached for: adding an application.
// Naming a slot after a feature that does not exist would have been the
// prototype leaking into the product.
export function BottomBar({
  onSearch,
  onQuickAdd,
}: {
  onSearch: () => void;
  onQuickAdd: () => void;
}) {
  const { t } = useTranslation();
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <nav className="bottombar" aria-label={t("menu.label")}>
      <button className="bottombar-slot" onClick={onQuickAdd}>
        <span aria-hidden="true" className="bottombar-glyph">
          +
        </span>
        <span className="bottombar-label">{t("quickAdd.add")}</span>
        <kbd className="bottombar-key">n</kbd>
      </button>
      <button className="bottombar-slot mid" onClick={onSearch}>
        <SearchIcon />
        <span className="bottombar-label">{t("header.search")}</span>
        <kbd className="bottombar-key">{isMac ? "\u2318K" : "Ctrl+K"}</kbd>
      </button>
      {/* The real bell, not a link to it: it owns its own unread count and
          popover, and duplicating either here would give two sources of
          truth for whether you have anything waiting. */}
      <span className="bottombar-slot end">
        <NotificationBell />
      </span>
    </nav>
  );
}

// The toast queue + its persistent live region (#285): the sr-only status
// stays mounted so screen readers announce each message even as the visible
// toasts mount/unmount.
export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {toasts.length ? toasts[toasts.length - 1].message : ""}
      </div>
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((toast) => (
            <div className="toast" key={toast.id}>
              <span>{toast.message}</span>
              {toast.undo && (
                <button
                  onClick={() => {
                    toast.undo?.();
                    onDismiss(toast.id);
                  }}
                >
                  {toast.label ?? t("toast.undo")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
