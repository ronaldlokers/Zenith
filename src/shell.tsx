// App-shell chrome, lifted out of App.tsx (shell split). These are
// app-singletons, not reusable primitives: they keep their App.css classes
// (.side/.top/.tabs/.toast) because the shell is a layout grid — .app is a
// flex container at >=900px and .side/.top/.tabs are its participants, sized
// by .app:has(...) per-view rules. That context can't be reproduced in an
// isolated @layer component, so these stay plain and App.css keeps owning
// the layout. Presentation only; all state/wiring lives in App.
import { useTranslation } from "react-i18next";
import { Logo, NavPipelineIcon, SearchIcon, SettingsIcon } from "./icons";
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
  onOpenBoard,
}: {
  scrolled: boolean;
  pageTitle: string;
  settingsActive: boolean;
  onOpenSettings: () => void;
  /** Opens the destination menu (#535 shell). */
  onOpenMenu: () => void;
  /** The left corner: straight to the pipeline. */
  onOpenBoard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <header className={`top${scrolled ? " scrolled" : ""}`}>
        <div className="top-corner">
          <button
            className="top-icon"
            onClick={onOpenBoard}
            title={t("tabs.pipeline")}
            aria-label={t("tabs.pipeline")}
          >
            <NavPipelineIcon />
          </button>
        </div>
        {/* The wordmark is the only navigation in the chrome, so it sits on
            the centre line rather than in a corner. */}
        <button
          className="top-brand"
          onClick={onOpenMenu}
          aria-haspopup="menu"
          aria-label={t("menu.open")}
        >
          {/* 25px, not the 22 it shipped at: the mark carries three rungs
              and a peak-star, and below about 22 they collapse into a smudge.
              22 was sitting exactly on that floor. */}
          <Logo size={25} />
          <span>Zenith</span>
          <svg
            className="top-chev"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className="top-corner end">
          <button
            className={`top-icon${settingsActive ? " active" : ""}`}
            onClick={onOpenSettings}
            title={t("header.settings")}
            aria-label={t("header.settings")}
            aria-current={settingsActive ? "page" : undefined}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>
      {/* The rule runs THROUGH the title line rather than under the block:
          the words are the break in the rule, which is what makes it read as
          a chapter heading instead of a header underline. */}
      <div className="page-title">
        <h1>{pageTitle}</h1>
      </div>
    </>
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
