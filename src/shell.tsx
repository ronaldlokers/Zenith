// App-shell chrome, lifted out of App.tsx (shell split). These are
// app-singletons, not reusable primitives: they keep their App.css classes
// (.side/.top/.tabs/.toast) because the shell is a layout grid — .app is a
// flex container at >=900px and .side/.top/.tabs are its participants, sized
// by .app:has(...) per-view rules. That context can't be reproduced in an
// isolated @layer component, so these stay plain and App.css keeps owning
// the layout. Presentation only; all state/wiring lives in App.
import { useTranslation } from "react-i18next";
import { Logo, SearchIcon, SettingsIcon } from "./icons";
import { Avatar, Button, NotificationBell } from "./components";
import { type Tab } from "./routing";
import { type Toast } from "./app-data";

export interface NavItem {
  data: string;
  to: Tab;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}

// Signed-in user shape the sidebar reads (subset of Better Auth's session
// user). name can be absent; email is the stable fallback label.
interface ShellUser {
  name?: string | null;
  email: string;
}

// The Night rail (>=900px). Renders the primary destinations plus the pinned
// settings + account foot; the onboarding checklist, when shown, is passed in
// as a node so the shell doesn't have to know its props.
export function Sidebar({
  navItems,
  settingsActive,
  onNavigate,
  onOpenSettings,
  onboarding,
  user,
  userInitials,
}: {
  navItems: NavItem[];
  settingsActive: boolean;
  onNavigate: (to: Tab) => void;
  onOpenSettings: () => void;
  onboarding: React.ReactNode;
  user: ShellUser | null | undefined;
  userInitials: string;
}) {
  const { t } = useTranslation();
  return (
    <aside className="side">
      <div className="side-brand">
        <Logo size={24} />
        <span>Zenith</span>
      </div>
      <nav className="side-nav" aria-label={t("tabs.overview")}>
        {navItems.map((n) => (
          <button
            key={n.data}
            className={`side-nav-item${n.active ? " on" : ""}`}
            aria-current={n.active ? "page" : undefined}
            data-tab={n.data}
            onClick={() => onNavigate(n.to)}
          >
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="side-foot">
        {onboarding}
        <button
          className={`side-nav-item side-settings${settingsActive ? " on" : ""}`}
          aria-current={settingsActive ? "page" : undefined}
          onClick={onOpenSettings}
        >
          <SettingsIcon />
          <span>{t("settings.title")}</span>
        </button>
        {user && (
          <button
            className="side-user"
            onClick={onOpenSettings}
            aria-label={t("account.signedInAs", { email: user.email })}
            title={user.email}
          >
            <Avatar initials={userInitials} aria-hidden="true" />
            <span className="u-info">
              <span className="u-name">{user.name || user.email}</span>
              <span className="u-email">{user.email}</span>
            </span>
            <span className="u-caret" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}

// The sticky top bar (chrome below the rail; carries the page title at
// >=900px). Brand + title + search launcher + notifications + settings + add.
export function TopBar({
  scrolled,
  pageTitle,
  settingsActive,
  onSearch,
  onOpenSettings,
  onQuickAdd,
}: {
  scrolled: boolean;
  pageTitle: string;
  settingsActive: boolean;
  onSearch: () => void;
  onOpenSettings: () => void;
  onQuickAdd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className={`top${scrolled ? " scrolled" : ""}`}>
      <span className="top-brand">
        <Logo size={22} />
        <span>Zenith</span>
      </span>
      <h1 className="top-title">{pageTitle}</h1>
      <button
        className="cmdk"
        onClick={onSearch}
        title={t("header.search")}
        aria-label={t("header.search")}
      >
        <SearchIcon />
        <span className="cmdk-label">{t("header.search")}</span>
        <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl+K"}</kbd>
      </button>
      <NotificationBell />
      <button
        className={`settings-btn top-settings${settingsActive ? " active" : ""}`}
        onClick={onOpenSettings}
        title={t("header.settings")}
        aria-label={t("header.settings")}
        aria-current={settingsActive ? "page" : undefined}
      >
        <SettingsIcon />
      </button>
      <Button
        variant="primary"
        className="top-add"
        onClick={onQuickAdd}
        aria-label={t("toolbar.addJob")}
      >
        <span aria-hidden="true">+</span>
        <span className="top-add-label">{t("quickAdd.add")}</span>
      </Button>
    </header>
  );
}

// The horizontal tab bar (sub-900px). navRef is forwarded so App's
// scroll-active-tab-into-view hook can reach the scrolling element.
export function MobileTabs({
  navItems,
  settingsActive,
  onNavigate,
  onOpenSettings,
  navRef,
}: {
  navItems: NavItem[];
  settingsActive: boolean;
  onNavigate: (to: Tab) => void;
  onOpenSettings: () => void;
  navRef: React.Ref<HTMLElement>;
}) {
  const { t } = useTranslation();
  return (
    <nav className="tabs" ref={navRef}>
      {navItems.map((n) => (
        <button
          key={n.data}
          className={n.active ? "active" : ""}
          aria-current={n.active ? "page" : undefined}
          data-tab={n.data}
          onClick={() => onNavigate(n.to)}
        >
          {n.icon}
          <span className="tab-label">{n.label}</span>
        </button>
      ))}
      <button
        className={`tab-settings${settingsActive ? " active" : ""}`}
        data-tab="settings"
        aria-current={settingsActive ? "page" : undefined}
        onClick={onOpenSettings}
      >
        <SettingsIcon />
        <span className="tab-label">{t("settings.title")}</span>
      </button>
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
