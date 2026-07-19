import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { signOut, useSession } from "./auth-client";
import {
  type CrudTabProps,
  type Stats,
  STATUSES,
  type Application,
  type Company,
  type Contact,
  type SavedView,
  type JobFilters,
  type RoleTypeDef,
  type Status,
  type Profile,
  type StatusHistoryRow,
  type AppNotification,
} from "./types";
import "./App.css";
import {
  ArchiveIcon,
  BellIcon,
  ErrorIcon,
  FilterIcon,
  Logo,
  NavCalendarIcon,
  NavCvIcon,
  NavFeedIcon,
  NavNetworkIcon,
  NavOverviewIcon,
  NavPipelineIcon,
  RemoveIcon,
  SearchIcon,
  SettingsIcon,
} from "./icons";
import {
  PIPELINE,
  formatDate,
  isDead,
  isOverdue,
  median,
  parseSqlDate,
  sortCards,
  today,
  CV_LANG_KEY,
  getCvLanguage,
} from "./format";
import type { BoardSort, Urgency } from "./format";
import { ConfirmHost, Dialog, LoadingSkeleton } from "./ui";
import {
  requestConfirm,
  rowActivate,
  useFocusTrap,
} from "./hooks";
import {
  AdminInvite,
  AdminUsers,
  ChangePassword,
  DeleteAccount,
  PublicApiSettings,
  PushSettings,
  SampleDataSettings,
  SessionManagement,
  TwoFactorSettings,
} from "./settings";
import { FeedSettings, FeedTab } from "./feed";
import { CompaniesTab, ContactsTab } from "./network";
import { CVTab } from "./cv";
import { CalendarTab } from "./calendar";
import { DashboardTab } from "./dashboard";
import { ApplicationDetailModal } from "./detail";

// Shared remove-icon glyph (#118) — a plain "×" character renders at
// inconsistent visual weight across browsers/fonts; an inline SVG at a
// fixed stroke width looks the same everywhere.
// Loading skeleton (#122) — replaces the plain "Loading…" text with
// shimmering placeholder bars shaped like the app's own .card rows.
type Tab =
  | "overview"
  | "applications"
  | "board"
  | "feed"
  | "calendar"
  | "stats"
  | "companies"
  | "contacts"
  | "cv"
  | "settings";

// URL routing (#73) — a small manual History-API layer via
// react-router's useLocation/useNavigate rather than a full <Routes>
// tree, since the app is a flat tab-switcher (no nested routes, no
// route params beyond an optional record id). Only Jobs/Board deep
// link to a specific record; other tabs are just /path.
const TAB_PATHS: Record<Tab, string> = {
  overview: "/",
  applications: "/jobs",
  board: "/board",
  feed: "/feed",
  calendar: "/calendar",
  stats: "/stats",
  companies: "/companies",
  contacts: "/people",
  cv: "/cv",
  settings: "/settings",
};

const PATH_TABS: Record<string, Tab> = {
  jobs: "applications",
  board: "board",
  feed: "feed",
  calendar: "calendar",
  // /activity and /stats fold into the Dashboard (#346); old links land there.
  activity: "overview",
  stats: "overview",
  companies: "companies",
  people: "contacts",
  cv: "cv",
  settings: "settings",
};

function parsePath(pathname: string): { tab: Tab; id: number | null } {
  const match = pathname.match(/^\/([a-z]+)(?:\/(\d+))?\/?$/);
  const tab = (match && PATH_TABS[match[1]]) || "overview";
  const id = match && match[2] ? Number(match[2]) : null;
  return { tab, id };
}

const LANGUAGES: [string, string][] = [
  ["en", "languageEn"],
  ["nl", "languageNl"],
];


function OnboardingChecklist({
  profileDone,
  companyDone,
  jobDone,
  onGoToProfile,
  onGoToCompanies,
  onAddJob,
  onDismiss,
  onLoadSample,
}: {
  profileDone: boolean;
  companyDone: boolean;
  jobDone: boolean;
  onGoToProfile: () => void;
  onGoToCompanies: () => void;
  onAddJob: () => void;
  onDismiss: () => void;
  onLoadSample: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="onboarding">
      <div className="onboarding-head">
        <h3>{t("onboarding.title")}</h3>
        <button
          className="onboarding-dismiss"
          onClick={onDismiss}
          aria-label={t("common.close")}
        >
          ×
        </button>
      </div>
      <ul>
        <li className={profileDone ? "done" : ""}>
          <button onClick={onGoToProfile}>{t("onboarding.profile")}</button>
        </li>
        <li className={companyDone ? "done" : ""}>
          <button onClick={onGoToCompanies}>{t("onboarding.company")}</button>
        </li>
        <li className={jobDone ? "done" : ""}>
          <button onClick={onAddJob}>{t("onboarding.firstJob")}</button>
        </li>
      </ul>
      {!jobDone && (
        <button className="linklike onboarding-sample" onClick={onLoadSample}>
          {t("onboarding.sampleLink")}
        </button>
      )}
    </div>
  );
}

function CommandPalette({
  applications,
  companies,
  contacts,
  onClose,
  onJumpToApplication,
  onJumpToCompany,
  onJumpToContact,
  actions,
}: {
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  onClose: () => void;
  onJumpToApplication: (id: number) => void;
  onJumpToCompany: (id: number) => void;
  onJumpToContact: (id: number) => void;
  actions: { id: string; label: string; run: () => void }[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  // One flat, ordered result list drives arrow-key navigation and the
  // listbox semantics (#285); visual grouping is derived from `group`.
  // Action rows show on open (empty query) so the palette is a launcher,
  // not only a search — and stay findable by name while searching.
  const actionItems = actions
    .filter((a) => !q || a.label.toLowerCase().includes(q))
    .map((a) => ({
      domId: `palette-act-${a.id}`,
      group: t("palette.actions"),
      label: <>{a.label}</>,
      onSelect: a.run,
    }));
  const items = q
    ? [
        ...applications
          .filter((a) => a.title.toLowerCase().includes(q))
          .slice(0, 6)
          .map((a) => ({
            domId: `palette-app-${a.id}`,
            group: t("tabs.jobs"),
            label: (
              <>
                {a.title}
                {a.company_name ? (
                  <span className="muted small"> — {a.company_name}</span>
                ) : null}
              </>
            ),
            onSelect: () => onJumpToApplication(a.id),
          })),
        ...companies
          .filter((c) => c.name.toLowerCase().includes(q))
          .slice(0, 6)
          .map((c) => ({
            domId: `palette-co-${c.id}`,
            group: t("tabs.companies"),
            label: <>{c.name}</>,
            onSelect: () => onJumpToCompany(c.id),
          })),
        ...contacts
          .filter((c) => c.name.toLowerCase().includes(q))
          .slice(0, 6)
          .map((c) => ({
            domId: `palette-ct-${c.id}`,
            group: t("tabs.people"),
            label: (
              <>
                {c.name}
                {c.company_name ? (
                  <span className="muted small"> — {c.company_name}</span>
                ) : null}
              </>
            ),
            onSelect: () => onJumpToContact(c.id),
          })),
        ...actionItems,
      ]
    : actionItems;
  const activeIndex = items.length ? Math.min(active, items.length - 1) : 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[activeIndex]?.onSelect();
    }
  };

  return (
    <Dialog label={t("palette.title")} onClose={onClose} className="command-palette">
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={t("palette.title")}
          aria-expanded={items.length > 0}
          aria-controls="palette-listbox"
          aria-activedescendant={
            items.length ? items[activeIndex].domId : undefined
          }
          className="palette-input"
          placeholder={t("palette.placeholder", {
            shortcut: /Mac|iPhone|iPad/.test(navigator.platform)
              ? "⌘K"
              : "Ctrl+K",
          })}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        {q && (
          <div className="palette-results" id="palette-listbox" role="listbox">
            {items.map((item, i) => {
              const showHeader = i === 0 || items[i - 1].group !== item.group;
              return (
                <Fragment key={item.domId}>
                  {showHeader && (
                    <span className="palette-group-label" role="presentation">
                      {item.group}
                    </span>
                  )}
                  <button
                    id={item.domId}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`palette-item${i === activeIndex ? " active" : ""}`}
                    onClick={item.onSelect}
                    onMouseEnter={() => setActive(i)}
                  >
                    {item.label}
                  </button>
                </Fragment>
              );
            })}
            {!items.length && (
              <p className="muted small">{t("palette.noResults")}</p>
            )}
          </div>
        )}
    </Dialog>
  );
}

// Self-serve account deletion (#285) — GDPR right-to-erasure. Strong
// confirm, then wipe + sign out.
// In-app notification center (#213) — due/overdue follow-ups, stale
// postings, and new Feed matches, generated server-side on the
// existing 6h cron (see worker/notifications.ts). Polled rather than
// pushed since there's no realtime transport in this app; a stale
// unread count for a few minutes is a fine tradeoff against adding one.
const NOTIFICATION_POLL_MS = 120_000;

function NotificationBell() {
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

const THEME_KEY = "jobseekr_theme";
const KEY_SHORTCUTS_KEY = "jobseekr_key_shortcuts";
// Single-character shortcuts (n, /) must be switchable off for speech-input
// and single-switch users (WCAG 2.1.4). Modified chords like ⌘K are exempt
// and stay on regardless. Read live at keypress so the setting takes effect
// without a reload.
function keyShortcutsEnabled(): boolean {
  return localStorage.getItem(KEY_SHORTCUTS_KEY) !== "off";
}

// Applies the persisted theme choice — called on initial load (see App())
// and whenever the Settings selector changes it.
function applyTheme(value: string) {
  // "auto" follows the OS via prefers-color-scheme (no attribute); "light"
  // and "dark" are explicit overrides that win regardless of the OS.
  if (value === "light" || value === "dark") {
    document.documentElement.dataset.theme = value;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

// Settings is a routed page with a section nav (#314) — it had grown to
// 14+ stacked sections (incl. an admin console) inside a 416px modal.
type SettingsSection =
  | "general"
  | "feed"
  | "sharing"
  | "security"
  | "integrations"
  | "data"
  | "admin";

const SETTINGS_SECTIONS: SettingsSection[] = [
  "general",
  "feed",
  "sharing",
  "security",
  "integrations",
  "data",
  "admin",
];

function SettingsPage({
  roleTypes,
  onRoleTypesChanged,
  notify,
}: {
  roleTypes: RoleTypeDef[];
  onRoleTypesChanged: () => Promise<void>;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: session } = useSession();
  const location = useLocation();
  // Deep-linkable sections (#314): /settings?s=feed lands on Feed sources.
  const requested = new URLSearchParams(location.search).get("s");
  const [section, setSection] = useState<SettingsSection>(
    SETTINGS_SECTIONS.includes(requested as SettingsSection)
      ? (requested as SettingsSection)
      : "general",
  );
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("s");
    if (q && SETTINGS_SECTIONS.includes(q as SettingsSection)) {
      setSection(q as SettingsSection);
    }
  }, [location.search]);
  const [cvLang, setCvLang] = useState(() =>
    getCvLanguage(i18n.resolvedLanguage ?? "en"),
  );
  const [theme, setTheme] = useState(
    () => {
      const saved = localStorage.getItem(THEME_KEY);
      // control-room retired (#346) — its users were on a dark theme, so
      // fold them into explicit Dark.
      return saved === "control-room" ? "dark" : (saved ?? "auto");
    },
  );
  const [keyShortcuts, setKeyShortcuts] = useState(keyShortcutsEnabled);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    api.profile().then((p) => {
      setShareToken(p.share_token);
      setCalendarToken(p.calendar_token);
    });
  }, []);

  const shareUrl = shareToken
    ? `${window.location.origin}/shared/${shareToken}`
    : null;

  const generateLink = async () => {
    // Regenerating breaks the link already shared with someone (#285).
    if (
      shareToken &&
      !(await requestConfirm(t("settings.regenerateLinkConfirm")))
    )
      return;
    setShareBusy(true);
    api
      .generateShareToken()
      .then((r) => setShareToken(r.share_token))
      .catch((e) => setApiError((e as Error).message))
      .finally(() => setShareBusy(false));
  };

  const disableLink = async () => {
    if (!(await requestConfirm(t("settings.disableLinkConfirm")))) return;
    setShareBusy(true);
    api
      .revokeShareToken()
      .then(() => setShareToken(null))
      .catch((e) => setApiError((e as Error).message))
      .finally(() => setShareBusy(false));
  };

  const calendarUrl = calendarToken
    ? `${window.location.origin}/calendar/${calendarToken}`
    : null;

  const generateCalendarLink = async () => {
    if (
      calendarToken &&
      !(await requestConfirm(t("settings.regenerateLinkConfirm")))
    )
      return;
    setCalendarBusy(true);
    api
      .generateCalendarToken()
      .then((r) => setCalendarToken(r.calendar_token))
      .catch((e) => setApiError((e as Error).message))
      .finally(() => setCalendarBusy(false));
  };

  const disableCalendarLink = async () => {
    if (!(await requestConfirm(t("settings.disableLinkConfirm")))) return;
    setCalendarBusy(true);
    api
      .revokeCalendarToken()
      .then(() => setCalendarToken(null))
      .catch((e) => setApiError((e as Error).message))
      .finally(() => setCalendarBusy(false));
  };

  const sections: SettingsSection[] = [
    "general",
    "feed",
    "sharing",
    ...(session ? (["security", "integrations", "data"] as const) : []),
    ...(session?.user.role === "admin" ? (["admin"] as const) : []),
  ];

  return (
    <section className="settings-page">
      <nav className="settings-nav" aria-label={t("settings.title")}>
        {sections.map((s) => (
          <button
            key={s}
            className={section === s ? "active" : ""}
            aria-current={section === s ? "true" : undefined}
            onClick={() => setSection(s)}
          >
            {t(`settings.section.${s}`)}
          </button>
        ))}
      </nav>
      <div className="settings-content settings-modal">
        <h2>{t(`settings.section.${section}`)}</h2>
        {session && (
          <div className="account-signed-in">
            <span>{t("account.signedInAs", { email: session.user.email })}</span>
            <button onClick={() => signOut()}>{t("account.signOut")}</button>
          </div>
        )}
        {apiError && <p className="login-error">{apiError}</p>}
        {section === "general" && (
          <>
        <label className="settings-field">
          <span>{t("settings.language")}</span>
          <select
            value={i18n.resolvedLanguage}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
          >
            {LANGUAGES.map(([code, labelKey]) => (
              <option key={code} value={code}>
                {t(`settings.${labelKey}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          <span>{t("settings.theme")}</span>
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              localStorage.setItem(THEME_KEY, e.target.value);
              applyTheme(e.target.value);
            }}
          >
            <option value="auto">{t("settings.themeAuto")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>
        </label>
        <label className="settings-field">
          <span>{t("settings.cvLanguage")}</span>
          <select
            value={cvLang}
            onChange={(e) => {
              setCvLang(e.target.value);
              localStorage.setItem(CV_LANG_KEY, e.target.value);
            }}
          >
            {LANGUAGES.map(([code, labelKey]) => (
              <option key={code} value={code}>
                {t(`settings.${labelKey}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field settings-check">
          <input
            type="checkbox"
            checked={keyShortcuts}
            onChange={(e) => {
              setKeyShortcuts(e.target.checked);
              localStorage.setItem(
                KEY_SHORTCUTS_KEY,
                e.target.checked ? "on" : "off",
              );
            }}
          />
          <span>{t("settings.keyShortcuts")}</span>
        </label>
          </>
        )}
        {section === "feed" && (
          <FeedSettings
            roleTypes={roleTypes}
            onRoleTypesChanged={onRoleTypesChanged}
            onError={setApiError}
            notify={notify}
          />
        )}
        {section === "sharing" && (
          <>
        <div className="settings-field share-field">
          <span>{t("settings.shareLink")}</span>
          {shareUrl ? (
            <>
              <input readOnly value={shareUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
              <div className="share-actions">
                <button disabled={shareBusy} onClick={generateLink}>
                  {t("settings.regenerateLink")}
                </button>
                <button disabled={shareBusy} className="danger" onClick={disableLink}>
                  {t("settings.disableLink")}
                </button>
              </div>
            </>
          ) : (
            <button disabled={shareBusy} onClick={generateLink}>
              {t("settings.generateLink")}
            </button>
          )}
        </div>
        <div className="settings-field share-field">
          <span>{t("settings.calendarLink")}</span>
          {calendarUrl ? (
            <>
              <input readOnly value={calendarUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
              <p className="muted small">{t("settings.calendarLinkHint")}</p>
              <div className="share-actions">
                <button disabled={calendarBusy} onClick={generateCalendarLink}>
                  {t("settings.regenerateLink")}
                </button>
                <button disabled={calendarBusy} className="danger" onClick={disableCalendarLink}>
                  {t("settings.disableLink")}
                </button>
              </div>
            </>
          ) : (
            <button disabled={calendarBusy} onClick={generateCalendarLink}>
              {t("settings.generateLink")}
            </button>
          )}
        </div>
          </>
        )}
        {section === "security" && session && (
          <div className="account-section">
            <TwoFactorSettings />
            <SessionManagement />
            <ChangePassword />
          </div>
        )}
        {section === "integrations" && session && (
          <div className="account-section">
            <PublicApiSettings onError={setApiError} />
            <PushSettings />
          </div>
        )}
        {section === "data" && session && (
          <div className="account-section">
            <SampleDataSettings onError={setApiError} />
            <DeleteAccount onError={setApiError} />
          </div>
        )}
        {section === "admin" && session?.user.role === "admin" && (
          <div className="account-section">
            <AdminUsers onError={setApiError} />
            <AdminInvite />
          </div>
        )}
      </div>
    </section>
  );
}

// Radial pipeline ring (#143) — replaces the Jobs-tab histogram with a
// donut: this one is a genuine part-of-a-whole snapshot (how currently-
// open applications break down by stage right now), which is what a
// donut communicates best, in the same compact footprint the histogram
// used. Stats tab's weekly bars (a trend, not a distribution) and
// pipeline funnel (cumulative-reached-per-stage, a different
// denominator, needs the funnel's decreasing-max shape) are untouched —
// this consolidates only the one genuinely overlapping chart.
interface Toast {
  id: number;
  message: string;
  undo?: () => void;
  label?: string;
}

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { tab, id: detailIdFromUrl } = parsePath(location.pathname);
  const setTab = (next: Tab) => navigate(TAB_PATHS[next]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [statsData, setStatsData] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleTypeDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [jumpQuery, setJumpQuery] = useState("");
  const [showPalette, setShowPalette] = useState(false);
  const [onboardingProfile, setOnboardingProfile] = useState<Profile | null>(
    null,
  );
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem("jobseekr_onboarding_dismissed") === "1",
  );
  const [scrolled, setScrolled] = useState(false);

  // Sticky header divider once the page scrolls under it (#126) — with
  // nothing scrolled it looks identical to the page background, so
  // there's no visual seam between header and content until this fires.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The mobile tab bar has more tabs than fit at 390px and scrolls
  // horizontally (#48). Keep the active tab in view on every switch —
  // otherwise a deep link or the keyboard-shortcut palette can land on
  // a tab scrolled off-screen with no visual cue it's even selected (#204).
  const tabsRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const active = tabsRef.current?.querySelector(
      `[data-tab="${tab}"]`,
    ) as HTMLElement | null;
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);

  useEffect(() => {
    if (onboardingDismissed) return;
    api.profile().then(setOnboardingProfile).catch(() => {});
  }, [onboardingDismissed]);

  const dismissOnboarding = () => {
    localStorage.setItem("jobseekr_onboarding_dismissed", "1");
    setOnboardingDismissed(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      } else if (
        e.key === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        keyShortcutsEnabled()
      ) {
        const el = document.activeElement as HTMLElement | null;
        if (
          el &&
          (el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.tagName === "SELECT" ||
            el.isContentEditable)
        )
          return;
        e.preventDefault();
        setShowQuickAdd(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [apps, comps, conts, roles, st] = await Promise.all([
        api.list<Application>("applications"),
        api.list<Company>("companies"),
        api.list<Contact>("contacts"),
        api.roleTypes(),
        // One stats fetch for the whole app (#314) — Overview's momentum,
        // the Pipeline's attention heat, and the Stats tab all read it.
        api.stats(),
      ]);
      setApplications(apps);
      setCompanies(comps);
      setContacts(conts);
      setRoleTypes(roles);
      setStatsData(st);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Defensive fallback for mobile browsers whose dynamic address-bar resize
  // can leave `position: fixed; bottom: 0` anchored below the visible area
  // (see #91) — track the real gap between the layout and visual viewport
  // and let .tabs read it instead of assuming bottom: 0 is always correct.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const setOffset = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      document.documentElement.style.setProperty(
        "--vv-bottom-offset",
        `${Math.max(0, offset)}px`,
      );
    };
    setOffset();
    vv.addEventListener("resize", setOffset);
    vv.addEventListener("scroll", setOffset);
    return () => {
      vv.removeEventListener("resize", setOffset);
      vv.removeEventListener("scroll", setOffset);
    };
  }, []);

  const notify = useCallback((message: string, undo?: () => void, label?: string) => {
    // Queue rather than a single slot (#346): a second notify used to erase
    // a live undo window before its 6s elapsed. Cap the stack so a burst
    // can't tower; oldest drops first.
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { id, message, undo, label }].slice(-3));
    window.setTimeout(
      () => setToasts((cur) => cur.filter((t) => t.id !== id)),
      undo ? 6000 : 3000,
    );
  }, []);

  // Delete with an undo window: hide immediately, commit after the
  // toast expires unless undone (cascaded data survives an undo).
  const deleteWithUndo = useCallback(
    (resource: string, id: number, name: string) => {
      const key = `${resource}:${id}`;
      setHidden((h) => new Set(h).add(key));
      const timer = window.setTimeout(() => {
        api
          .remove(resource, id)
          .then(reload)
          .catch((e) => setError((e as Error).message))
          .finally(() =>
            setHidden((h) => {
              const next = new Set(h);
              next.delete(key);
              return next;
            }),
          );
      }, 6000);
      notify(t("toast.deleted", { name }), () => {
        window.clearTimeout(timer);
        setHidden((h) => {
          const next = new Set(h);
          next.delete(key);
          return next;
        });
      });
    },
    [notify, reload, t],
  );

  // Optimistic status change: update locally, revert on API failure
  const setStatus = useCallback(
    (id: number, status: Status) => {
      const prev = applications;
      const prevStatus = applications.find((a) => a.id === id)?.status;
      setApplications((apps) =>
        apps.map((a) => (a.id === id ? { ...a, status } : a)),
      );
      api
        .setStatus(id, status)
        .then(reload)
        .then(() => {
          if (prevStatus == null || prevStatus === status) return;
          if (status === "offer") {
            // The comp fields (and everything they unlock — compare,
            // benchmark, negotiation draft) only matter now; surface the
            // entry path instead of leaving it to a status-order dance.
            notify(
              t("offer.recordPrompt"),
              () => navigate(`/jobs/${id}`),
              t("toast.open"),
            );
          } else if (isDead(prevStatus) && !isDead(status)) {
            notify(
              t("toast.revived"),
              () => navigate(`/jobs/${id}`),
              t("toast.setFollowUp"),
            );
          } else {
            notify(t("toast.statusChanged", { stage: t(`stages.${status}`) }), () =>
              api
                .setStatus(id, prevStatus)
                .then(reload)
                .catch((e) => setError((e as Error).message)),
            );
          }
        })
        .catch((e) => {
          setApplications(prev);
          setError((e as Error).message);
        });
    },
    [applications, reload, notify, navigate, t],
  );

  const visibleApps = applications.filter(
    (a) => !hidden.has(`applications:${a.id}`),
  );
  // Archived applications keep contributing to Stats history but are
  // hidden from the active pipeline views (header count, Board, Next up).
  const activeApps = visibleApps.filter((a) => !a.archived_at);
  // /jobs/:id and /board/:id render a routed detail page (#314) instead
  // of the old pane/overlay duality — one presentation for every entry
  // point, back-button friendly.
  const routedJob =
    (tab === "applications" || tab === "board") && detailIdFromUrl != null
      ? visibleApps.find((a) => a.id === detailIdFromUrl) ?? null
      : null;
  const visibleCompanies = companies.filter(
    (c) => !hidden.has(`companies:${c.id}`),
  );
  const visibleContacts = contacts.filter(
    (c) => !hidden.has(`contacts:${c.id}`),
  );

  return (
    <div className="app">
      {showQuickAdd && (
        <QuickAddDialog
          companies={visibleCompanies}
          onClose={() => setShowQuickAdd(false)}
          onError={setError}
          onCreated={(a, open) => {
            setShowQuickAdd(false);
            notify(t("common.saved"));
            // Navigate on the optimistic append instead of blocking on the
            // five-endpoint reload — the page fills in as data lands.
            setApplications((prev) => [...prev, a]);
            if (open) navigate(`/jobs/${a.id}`);
            void reload();
          }}
        />
      )}
      {showPalette && (
        <CommandPalette
          applications={activeApps}
          companies={visibleCompanies}
          contacts={visibleContacts}
          onClose={() => setShowPalette(false)}
          onJumpToApplication={(id) => {
            navigate(`/jobs/${id}`);
            setShowPalette(false);
          }}
          onJumpToCompany={(id) => {
            navigate(`/companies/${id}`);
            setShowPalette(false);
          }}
          onJumpToContact={(id) => {
            navigate(`/people/${id}`);
            setShowPalette(false);
          }}
          actions={[
            {
              id: "add-job",
              label: t("palette.addJob"),
              run: () => {
                setShowPalette(false);
                setShowQuickAdd(true);
              },
            },
            {
              id: "settings",
              label: t("palette.goSettings"),
              run: () => {
                setShowPalette(false);
                navigate("/settings");
              },
            },
          ]}
        />
      )}
      <header className={`header${scrolled ? " scrolled" : ""}`}>
        <div className="brand">
          <Logo size={20} />
          <h1>JobSeekr</h1>
        </div>
        <span className="header-actions">
          <button
            className="settings-btn"
            onClick={() => setShowPalette(true)}
            title={t("header.search")}
            aria-label={t("header.search")}
          >
            <SearchIcon />
          </button>
          <NotificationBell />
          <button
            className={`settings-btn${tab === "settings" ? " active" : ""}`}
            onClick={() => setTab("settings")}
            title={t("header.settings")}
            aria-label={t("header.settings")}
            aria-current={tab === "settings" ? "page" : undefined}
          >
            <SettingsIcon />
          </button>
        </span>
      </header>
      <nav className="tabs" ref={tabsRef}>
        <button
          className={tab === "overview" ? "active" : ""}
          aria-current={tab === "overview" ? "page" : undefined}
          data-tab="overview"
          onClick={() => setTab("overview")}
        >
          <NavOverviewIcon />
          <span className="tab-label">{t("tabs.overview")}</span>
        </button>
        <button
          className={tab === "applications" || tab === "board" ? "active" : ""}
          aria-current={tab === "applications" || tab === "board" ? "page" : undefined}
          data-tab="pipeline"
          onClick={() => setTab("board")}
        >
          <NavPipelineIcon />
          <span className="tab-label">{t("tabs.pipeline")}</span>
        </button>
        <button
          className={tab === "feed" ? "active" : ""}
          aria-current={tab === "feed" ? "page" : undefined}
          data-tab="feed"
          onClick={() => setTab("feed")}
        >
          <NavFeedIcon />
          <span className="tab-label">{t("tabs.feed")}</span>
        </button>
        <button
          className={tab === "calendar" ? "active" : ""}
          aria-current={tab === "calendar" ? "page" : undefined}
          data-tab="calendar"
          onClick={() => setTab("calendar")}
        >
          <NavCalendarIcon />
          <span className="tab-label">{t("tabs.calendar")}</span>
        </button>
        <button
          className={tab === "companies" || tab === "contacts" ? "active" : ""}
          aria-current={tab === "companies" || tab === "contacts" ? "page" : undefined}
          data-tab="network"
          onClick={() => setTab("companies")}
        >
          <NavNetworkIcon />
          <span className="tab-label">{t("tabs.network")}</span>
        </button>
        <button
          className={tab === "cv" ? "active" : ""}
          aria-current={tab === "cv" ? "page" : undefined}
          data-tab="cv"
          onClick={() => setTab("cv")}
        >
          <NavCvIcon />
          <span className="tab-label">{t("tabs.cv")}</span>
        </button>
        <button
          className={`tab-settings${tab === "settings" ? " active" : ""}`}
          data-tab="settings"
          aria-current={tab === "settings" ? "page" : undefined}
          onClick={() => setTab("settings")}
        >
          <SettingsIcon />
          <span className="tab-label">{t("settings.title")}</span>
        </button>
      </nav>

      {error && (
        <p className="error">
          <ErrorIcon />
          <span className="error-text">{error}</span>
          <button
            type="button"
            className="error-dismiss"
            onClick={() => setError(null)}
            aria-label={t("common.close")}
          >
            <RemoveIcon />
          </button>
        </p>
      )}

      <main className="content">
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {tab === "overview" &&
              !onboardingDismissed &&
              !(
                onboardingProfile?.name &&
                onboardingProfile?.email &&
                companies.length > 0 &&
                applications.length > 0
              ) && (
                <OnboardingChecklist
                  profileDone={
                    !!(onboardingProfile?.name && onboardingProfile?.email)
                  }
                  companyDone={companies.length > 0}
                  jobDone={applications.length > 0}
                  onGoToProfile={() => setTab("cv")}
                  onGoToCompanies={() => setTab("companies")}
                  onAddJob={() => setShowQuickAdd(true)}
                  onDismiss={dismissOnboarding}
                  onLoadSample={() => navigate("/settings?s=data")}
                />
              )}
            {tab === "overview" && (
              <DashboardTab
                applications={visibleApps}
                fullApps={applications}
                onGoToJobs={() => setTab("board")}
                onOpenJob={(id) => navigate(`/jobs/${id}`)}
                onError={setError}
                onChanged={reload}
                stats={statsData}
                notify={notify}
                onOpenQuickAdd={() => setShowQuickAdd(true)}
              />
            )}
            {routedJob && (
              <section className="job-page">
                <button
                  className="btn-secondary job-back"
                  onClick={() => navigate("/board")}
                >
                  ← {t("tabs.pipeline")}
                </button>
                <ApplicationDetailModal
                  key={routedJob.id}
                  application={routedJob}
                  allApplications={visibleApps}
                  companies={visibleCompanies}
                  contacts={visibleContacts}
                  roleTypes={roleTypes}
                  onClose={() => navigate("/board")}
                  onChanged={reload}
                  onError={setError}
                  notify={notify}
                  onDelete={deleteWithUndo}
                  onStatus={setStatus}
                  asPane
                />
              </section>
            )}
            {(tab === "applications" || tab === "board") && !routedJob && (
              <PipelineTab
                applications={visibleApps}
                companies={visibleCompanies}
                contacts={visibleContacts}
                roleTypes={roleTypes}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
                onStatus={setStatus}
                initialQuery={jumpQuery}
                onQueryConsumed={() => setJumpQuery("")}
                history={statsData?.history ?? []}
                lastInteractions={statsData?.interactions ?? []}
                onOpenJob={(id: number | null) =>
                  navigate(id ? `/jobs/${id}` : "/board")
                }
                onOpenQuickAdd={() => setShowQuickAdd(true)}
                onOpenSampleData={() => navigate("/settings?s=data")}
              />
            )}
            {tab === "feed" && (
              <FeedTab
                onError={setError}
                notify={notify}
                roleTypes={roleTypes}
                onOpenSettings={() => navigate("/settings?s=feed")}
                onChanged={reload}
                onOpenJob={(id) => navigate(`/jobs/${id}`)}
              />
            )}
            {tab === "calendar" && (
              <CalendarTab
                onError={setError}
                onJump={(title) => {
                  setJumpQuery(title);
                  setTab("board");
                }}
              />
            )}
            {(tab === "companies" || tab === "contacts") && (
              <div
                className="subnav"
                role="tablist"
                aria-label={t("tabs.network")}
              >
                <button
                  role="tab"
                  aria-selected={tab === "companies"}
                  className={tab === "companies" ? "active" : ""}
                  onClick={() => setTab("companies")}
                >
                  {t("tabs.companies")}
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "contacts"}
                  className={tab === "contacts" ? "active" : ""}
                  onClick={() => setTab("contacts")}
                >
                  {t("tabs.people")}
                </button>
              </div>
            )}
            {tab === "companies" && (
              <CompaniesTab
                companies={visibleCompanies}
                applications={visibleApps}
                contacts={visibleContacts}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
                initialQuery={jumpQuery}
                initialDetailId={detailIdFromUrl}
                onDetailIdChange={(id) =>
                  navigate(id ? `/companies/${id}` : "/companies")
                }
              />
            )}
            {tab === "contacts" && (
              <ContactsTab
                contacts={visibleContacts}
                companies={visibleCompanies}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
                initialQuery={jumpQuery}
                initialDetailId={detailIdFromUrl}
                onDetailIdChange={(id) =>
                  navigate(id ? `/people/${id}` : "/people")
                }
              />
            )}
            {tab === "cv" && <CVTab onError={setError} notify={notify} />}
            {tab === "settings" && (
              <SettingsPage
                roleTypes={roleTypes}
                onRoleTypesChanged={reload}
                notify={notify}
              />
            )}
          </>
        )}
      </main>

      <button
        className="quick-add-fab"
        onClick={() => setShowQuickAdd(true)}
        aria-label={t("toolbar.addJob")}
      >
        +
      </button>

      {/* Persistent live region (#285) — always in the DOM so screen
          readers announce each new toast message; the visible toast below
          mounts/unmounts and can't be relied on to announce on its own. */}
      <div className="sr-only" role="status" aria-live="polite">
        {toasts.length ? toasts[toasts.length - 1].message : ""}
      </div>
      <ConfirmHost />
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((toast) => (
            <div className="toast" key={toast.id}>
              <span>{toast.message}</span>
              {toast.undo && (
                <button
                  onClick={() => {
                    toast.undo?.();
                    setToasts((cur) => cur.filter((t) => t.id !== toast.id));
                  }}
                >
                  {toast.label ?? t("toast.undo")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Card urgency (#346) — a single worst-wins state driving the coloured
// left edge and the one action line/badge a card may show.
// One board card (#346) — a coloured left edge for urgency (worst-wins),
// title + company, at most one action line/badge, and a ⋯ menu that
// replaces the old per-card status dropdown.
function CardMenu({
  a,
  onMove,
  onSetFollowUp,
  onOpenDetail,
  onArchive,
}: {
  a: Application;
  onMove: (status: string) => void;
  onSetFollowUp: (date: string | null, text: string | null) => void;
  onOpenDetail: () => void;
  onArchive: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<null | "root" | "move" | "followup">(null);
  const [fuDate, setFuDate] = useState(a.next_action_at?.slice(0, 10) ?? "");
  const [fuText, setFuText] = useState(a.next_action ?? "");
  const close = () => setMode(null);
  return (
    <div className="card-menu" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="card-menu-btn"
        aria-label={t("board.cardMenu", { title: a.title })}
        aria-haspopup="menu"
        onClick={() => setMode((m) => (m ? null : "root"))}
      >
        ⋯
      </button>
      {mode && (
        <>
          <div className="card-menu-backdrop" onClick={close} />
          <div className="card-menu-pop" role="menu">
            {mode === "root" && (
              <>
                <button type="button" role="menuitem" onClick={() => setMode("move")}>
                  {t("board.moveToStage")} ▸
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setMode("followup")}
                >
                  {t("detail.setFollowUp")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onOpenDetail();
                  }}
                >
                  {t("common.open")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    close();
                    onArchive();
                  }}
                >
                  {t("detail.archive")}
                </button>
              </>
            )}
            {mode === "move" && (
              <>
                {STATUSES.filter((sName) => sName !== a.status).map((sName) => (
                  <button
                    key={sName}
                    type="button"
                    role="menuitem"
                    className={`stage-${sName}`}
                    onClick={() => {
                      close();
                      onMove(sName);
                    }}
                  >
                    <span className="card-menu-dot" /> {t(`stages.${sName}`)}
                  </button>
                ))}
              </>
            )}
            {mode === "followup" && (
              <form
                className="card-menu-fu"
                onSubmit={(e) => {
                  e.preventDefault();
                  close();
                  onSetFollowUp(fuDate || null, fuText.trim() || null);
                }}
              >
                <input
                  value={fuText}
                  onChange={(e) => setFuText(e.target.value)}
                  placeholder={t("detail.followUpFallback")}
                  autoFocus
                />
                <input
                  type="date"
                  value={fuDate}
                  onChange={(e) => setFuDate(e.target.value)}
                />
                <div className="card-menu-fu-actions">
                  <button type="submit" className="primary">
                    {t("common.save")}
                  </button>
                  {a.next_action_at && (
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        onSetFollowUp(null, null);
                      }}
                    >
                      {t("nextUp.done")}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BoardCard({
  a,
  urgency,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpenDetail,
  onMove,
  onSetFollowUp,
  onArchive,
}: {
  a: Application;
  urgency: Urgency;
  draggable: boolean;
  isDragging: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onOpenDetail: () => void;
  onMove: (status: string) => void;
  onSetFollowUp: (date: string | null, text: string | null) => void;
  onArchive: () => void;
}) {
  const { t } = useTranslation();
  const actionable = urgency === "overdue" || urgency === "today";
  return (
    <article
      className={`bcard u-${urgency ?? "calm"}${isDragging ? " dragging" : ""}${a.archived_at ? " archived" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <CardMenu
        a={a}
        onMove={onMove}
        onSetFollowUp={onSetFollowUp}
        onOpenDetail={onOpenDetail}
        onArchive={onArchive}
      />
      <div className="bcard-body" onClick={onOpenDetail}>
        <strong>
          {a.title}
          {a.fit_score ? (
            <span className="fit-stars" title={`${a.fit_score}/5`}>
              {" "}
              {"★".repeat(a.fit_score)}
            </span>
          ) : null}
        </strong>
        <span className="co">
          {a.company_name ?? "—"}
          {a.contact_name ? ` · ${a.contact_name}` : ""}
        </span>
        {actionable ? (
          <span className="baction">
            → {a.next_action ?? t("detail.followUpFallback")}
            {" · "}
            {t(`urgency.${urgency}`)}
          </span>
        ) : urgency === "stale" || urgency === "quiet" ? (
          <span className={`bbadge u-${urgency}`}>{t(`attention.${urgency}`)}</span>
        ) : null}
      </div>
    </article>
  );
}
function BoardTab({
  applications,
  attention,
  sort,
  companies,
  contacts,
  roleTypes,
  onChanged,
  onError,
  notify,
  onDelete,
  onStatus,
  initialDetailId,
  onDetailIdChange,
}: CrudTabProps & {
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  onStatus: (id: number, status: Status) => void;
  attention?: Map<number, Urgency>;
  sort: BoardSort;
  initialDetailId?: number | null;
  onDetailIdChange?: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const move = (a: Application, status: string) =>
    onStatus(a.id, status as Status);
  const urgencyOf = (a: Application): Urgency => attention?.get(a.id) ?? null;

  const setFollowUp = (
    id: number,
    date: string | null,
    text: string | null,
  ) =>
    api
      .updateFollowUp(id, { next_action: text, next_action_at: date })
      .then(() => onChanged())
      .catch((e) => onError((e as Error).message));

  const archive = (id: number) =>
    api
      .archiveApplication(id)
      .then(() => onChanged())
      .then(() =>
        notify(t("toast.archived"), () =>
          api
            .unarchiveApplication(id)
            .then(() => onChanged())
            .catch((e) => onError((e as Error).message)),
        ),
      )
      .catch((e) => onError((e as Error).message));

  const open = applications.filter((a) => !isDead(a.status));

  // Drag-and-drop is gated off on touch (#54); on touch the ⋯ menu's
  // "Move to stage" reclassifies a card instead.
  const [isCoarsePointer, setIsCoarsePointer] = useState(
    () => window.matchMedia("(pointer: coarse)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const onChange = () => setIsCoarsePointer(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Status | null>(null);
  const [detailId, setDetailIdState] = useState<number | null>(
    initialDetailId ?? null,
  );
  useEffect(() => {
    setDetailIdState(initialDetailId ?? null);
  }, [initialDetailId]);
  const setDetailId = (id: number | null) => {
    setDetailIdState(id);
    onDetailIdChange?.(id);
  };
  const detailApp = applications.find((a) => a.id === detailId) ?? null;

  // Column counts + funnel proportion — headers carry the funnel now that
  // the ring is gone (#346).
  const stageCounts = PIPELINE.map(
    (stage) => open.filter((a) => a.status === stage).length,
  );
  const funnelBase = Math.max(1, ...stageCounts);

  const cardProps = (a: Application) => ({
    urgency: urgencyOf(a),
    onOpenDetail: () => setDetailId(a.id),
    onMove: (status: string) => move(a, status),
    onSetFollowUp: (date: string | null, text: string | null) =>
      setFollowUp(a.id, date, text),
    onArchive: () => archive(a.id),
  });

  return (
    <>
    <div className="board">
      {PIPELINE.map((stage, i) => {
        const cards = sortCards(
          open.filter((a) => a.status === stage),
          sort,
          urgencyOf,
        );
        const className = `bcol stage-${stage}${dragOverStage === stage ? " drag-over" : ""}`;
        const handleDragOver = (e: React.DragEvent) => {
          if (draggingId === null) return;
          e.preventDefault();
          setDragOverStage(stage);
        };
        const handleDragLeave = () =>
          setDragOverStage((sName) => (sName === stage ? null : sName));
        const handleDrop = (e: React.DragEvent) => {
          e.preventDefault();
          const id = Number(e.dataTransfer.getData("text/plain"));
          if (id) onStatus(id, stage);
          setDraggingId(null);
          setDragOverStage(null);
        };
        return (
          <div
            key={stage}
            className={className}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="bcol-head">
              {t(`stages.${stage}`)}
              <span className="n">{stageCounts[i]}</span>
            </div>
            <div className="bcol-prop" aria-hidden="true">
              <i
                className={`s-${stage}`}
                style={{ width: `${(stageCounts[i] / funnelBase) * 100}%` }}
              />
            </div>
            <div className="bcol-cards">
              {cards.map((a) => (
                <BoardCard
                  key={a.id}
                  a={a}
                  draggable={!isCoarsePointer}
                  isDragging={draggingId === a.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(a.id));
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(a.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverStage(null);
                  }}
                  {...cardProps(a)}
                />
              ))}
              {cards.length === 0 && (
                <div className="bempty">
                  {stage === "offer"
                    ? t("empty.boardKeepPushing")
                    : t("empty.boardEmpty")}
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
      {detailApp && (
        <ApplicationDetailModal
          key={detailApp.id}
          application={detailApp}
          allApplications={applications}
          companies={companies}
          contacts={contacts}
          roleTypes={roleTypes}
          onClose={() => setDetailId(null)}
          onChanged={onChanged}
          onError={onError}
          notify={notify}
          onDelete={onDelete}
          onStatus={onStatus}
        />
      )}
    </>
  );
}
function QuickAddDialog({
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
        <div className="form-actions">
          <button type="submit" className="primary" disabled={busy || !title.trim()}>
            {t("quickAdd.addOpen")}
          </button>
          <button type="button" disabled={busy || !title.trim()} onClick={() => submit(false)}>
            {t("quickAdd.add")}
          </button>
          <button type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
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
function PipelineTab({
  applications,
  companies,
  contacts,
  roleTypes,
  onChanged,
  onError,
  notify,
  onDelete,
  onStatus,
  lastInteractions,
  initialQuery,
  onQueryConsumed,
  history,
  onOpenJob,
  onOpenQuickAdd,
  onOpenSampleData,
}: CrudTabProps & {
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  onStatus: (id: number, status: Status) => void;
  initialQuery?: string;
  onQueryConsumed?: () => void;
  history: StatusHistoryRow[];
  lastInteractions: { application_id: number; last_at: string }[];
  onOpenJob: (id: number | null) => void;
  onOpenQuickAdd: () => void;
  onOpenSampleData: () => void;
}) {
  const { t } = useTranslation();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [query, setQuery] = useState(initialQuery ?? "");
  // Global sort applied to every column (#346), default urgency.
  const [sort, setSort] = useState<BoardSort>("urgency");
  // Filters behind a Filter button; the Archived modal replaces the old
  // Closed drawer (#346).
  const [showFilters, setShowFilters] = useState(false);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [archivedFilter, setArchivedFilter] = useState<
    "all" | "rejected" | "ghosted" | "withdrawn" | "archived"
  >("all");

  // One-shot: consume the jump query then clear it upstream, so a single
  // Calendar jump doesn't re-inject the search on every later visit (#314).
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      onQueryConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Saved views (#277) — the schema keeps statusFilter/sort for
  // back-compat with views saved from the old list; the board ignores
  // them (columns are the status filter).
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [namingView, setNamingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const loadViews = useCallback(
    () =>
      api
        .savedViews()
        .then(setSavedViews)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );
  useEffect(() => {
    loadViews();
  }, [loadViews]);

  const currentFilters = (): JobFilters => ({
    query,
    statusFilter: "all",
    roleFilter,
    companyFilter,
    tagFilter,
    showArchived: false,
    sort: "updated",
  });
  const applyView = (v: SavedView) => {
    const f = v.filters;
    setQuery(f.query ?? "");
    setRoleFilter(f.roleFilter ?? "all");
    setCompanyFilter(f.companyFilter ?? "all");
    setTagFilter(f.tagFilter ?? "all");
  };
  const saveCurrentView = () => {
    const name = newViewName.trim();
    if (!name) return;
    api
      .createSavedView(name, currentFilters())
      .then((v) => {
        setSavedViews((vs) => [...vs, v]);
        notify(t("savedViews.saved", { name }));
        setNamingView(false);
        setNewViewName("");
      })
      .catch((e) => onError((e as Error).message));
  };
  const deleteView = (id: number) => {
    api
      .deleteSavedView(id)
      .then(() => setSavedViews((vs) => vs.filter((v) => v.id !== id)))
      .catch((e) => onError((e as Error).message));
  };
  // Compare only the fields the board still uses, so legacy views saved
  // from the old list (with status/sort) can still read as active (#314).
  const boardFields = (f: JobFilters) => ({
    query: f.query ?? "",
    roleFilter: f.roleFilter ?? "all",
    companyFilter: f.companyFilter ?? "all",
    tagFilter: f.tagFilter ?? "all",
    showArchived: !!f.showArchived,
  });
  const curFilterKey = JSON.stringify(boardFields(currentFilters()));

  // Aggregation depends only on the data, not on query/filter state — a
  // useMemo keeps the full applications×history pass off every keystroke
  // of the search box (#346).
  const { allTags, attention } = useMemo(() => {
  const allTags = [
    ...new Map(
      applications.flatMap((a) => a.tags).map((tg) => [tg.id, tg]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  // Worst-wins attention signal per card (#314) — overdue > stale >
  // quiet, where "quiet" compares the silence against this employer's
  // own typical gap between status changes (#142's heat logic).
  const byAppHistory = new Map<number, StatusHistoryRow[]>();
  for (const row of history) {
    const list = byAppHistory.get(row.application_id) ?? [];
    list.push(row);
    byAppHistory.set(row.application_id, list);
  }
  const lastActivity = new Map<number, number>();
  const gapsByApp = new Map<number, number[]>();
  for (const a of applications) {
    lastActivity.set(a.id, parseSqlDate(a.applied_at ?? a.created_at));
  }
  for (const [appId, rows] of byAppHistory) {
    const times = rows.map((r) => parseSqlDate(r.changed_at));
    if (times.length) lastActivity.set(appId, times[times.length - 1]);
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) {
      gaps.push((times[i] - times[i - 1]) / 86400000);
    }
    gapsByApp.set(appId, gaps);
  }
  // A logged interaction (email, call, interview) is activity too — the
  // quiet badge said "consider a nudge"; the nudge must clear it.
  for (const r of lastInteractions) {
    const ts = parseSqlDate(r.last_at);
    if (ts > (lastActivity.get(r.application_id) ?? 0)) {
      lastActivity.set(r.application_id, ts);
    }
  }
  const gapsByCompany = new Map<number, number[]>();
  for (const a of applications) {
    if (a.company_id == null) continue;
    const list = gapsByCompany.get(a.company_id) ?? [];
    list.push(...(gapsByApp.get(a.id) ?? []));
    gapsByCompany.set(a.company_id, list);
  }
  const nowMs = Date.now();
  const FALLBACK_NORM_DAYS = 7;
  const attention = new Map<number, Urgency>();
  const todayStr = today();
  for (const a of applications) {
    if (isDead(a.status) || a.archived_at) continue;
    const companyGaps =
      a.company_id != null ? (gapsByCompany.get(a.company_id) ?? []) : [];
    const norm =
      companyGaps.length >= 2
        ? (median(companyGaps) ?? FALLBACK_NORM_DAYS)
        : FALLBACK_NORM_DAYS;
    const last = lastActivity.get(a.id) ?? parseSqlDate(a.created_at);
    const daysSince = (nowMs - last) / 86400000;
    // Only flag "quiet" when the company has enough recorded history to
    // personalize the norm — the generic fallback over-fires on new
    // relationships (guard restored; #330 dropped it).
    const quiet =
      companyGaps.length >= 2 && daysSince / norm >= 1.5 && daysSince >= 5;
    // Worst-wins: overdue > due-today > posting-stale > gone-quiet (#346).
    const val: Urgency = isOverdue(a)
      ? "overdue"
      : a.next_action_at === todayStr
        ? "today"
        : a.posting_status === "maybe_stale"
          ? "stale"
          : quiet
            ? "quiet"
            : null;
    if (val) attention.set(a.id, val);
  }
  return { allTags, attention };
  }, [applications, history, lastInteractions]);

  const q = query.trim().toLowerCase();
  const filtered = applications.filter(
    (a) =>
      !a.archived_at &&
      (roleFilter === "all" || a.role_type === roleFilter) &&
      (companyFilter === "all" || String(a.company_id) === companyFilter) &&
      (tagFilter === "all" ||
        a.tags.some((tg) => String(tg.id) === tagFilter)) &&
      (!q ||
        [a.title, a.company_name, a.contact_name, a.notes, a.source]
          .filter(Boolean)
          .some((f) => (f as string).toLowerCase().includes(q))),
  );

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!keyShortcutsEnabled()) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeFilterCount =
    (roleFilter !== "all" ? 1 : 0) +
    (companyFilter !== "all" ? 1 : 0) +
    (tagFilter !== "all" ? 1 : 0);
  // Inactive jobs (closed statuses + manually archived) — the Archived
  // modal's contents, off the board entirely (#346).
  const inactive = applications
    .filter((a) => isDead(a.status) || a.archived_at)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const reasonOf = (a: Application) =>
    isDead(a.status) ? (a.status as "rejected" | "withdrawn" | "ghosted") : "archived";
  const archivedTabs = [
    { key: "all" as const, n: inactive.length },
    { key: "rejected" as const, n: inactive.filter((a) => reasonOf(a) === "rejected").length },
    { key: "ghosted" as const, n: inactive.filter((a) => reasonOf(a) === "ghosted").length },
    { key: "withdrawn" as const, n: inactive.filter((a) => reasonOf(a) === "withdrawn").length },
    { key: "archived" as const, n: inactive.filter((a) => reasonOf(a) === "archived").length },
  ].filter((tobj) => tobj.key === "all" || tobj.n > 0);
  const shownArchived =
    archivedFilter === "all"
      ? inactive
      : inactive.filter((a) => reasonOf(a) === archivedFilter);

  return (
    <section>
      {applications.length === 0 && (
        <p className="pipeline-empty-hint">
          {t("empty.pipelineNoJobs")}{" "}
          <button className="linklike" onClick={onOpenQuickAdd}>
            {t("toolbar.addJob")}
          </button>
          {" · "}
          <button className="linklike" onClick={onOpenSampleData}>
            {t("sampleData.load")}
          </button>
        </p>
      )}

      {/* Slim bar (#346): search · filter · sort · archived · add. The
          funnel ring is gone — counts live in the column headers now. */}
      <div className="board-bar">
        <span className="board-search-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          ref={searchRef}
          type="search"
          className="search"
          aria-label={t("toolbar.searchPlaceholder")}
          placeholder={t("toolbar.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className={`board-bar-btn${showFilters || activeFilterCount ? " active" : ""}`}
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          <FilterIcon />
          {t("board.filterBtn")}
          {activeFilterCount ? ` · ${activeFilterCount}` : ""}
        </button>
        <label className="board-sort" title={t("board.sortBy")}>
          <select value={sort} onChange={(e) => setSort(e.target.value as BoardSort)}>
            <option value="urgency">{t("board.sortUrgency")}</option>
            <option value="followup">{t("board.sortFollowup")}</option>
            <option value="fit">{t("board.sortFit")}</option>
            <option value="updated">{t("board.sortUpdated")}</option>
          </select>
        </label>
        <button
          type="button"
          className="board-bar-btn"
          onClick={() => setShowArchivedModal(true)}
        >
          <ArchiveIcon />
          {t("board.archivedBtn")}
          {inactive.length ? ` · ${inactive.length}` : ""}
        </button>
        <button className="primary" onClick={onOpenQuickAdd}>
          {t("toolbar.addJob")}
        </button>
      </div>

      {showFilters && (
        <div className="board-filters-pop">
          <div className="filters-fields">
            <label className="filter-field">
              <span>{t("filters.role")}</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">{t("filters.allRoles")}</option>
                {roleTypes.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>{t("filters.company")}</span>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
              >
                <option value="all">{t("filters.allCompanies")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {allTags.length > 0 && (
              <label className="filter-field">
                <span>{t("filters.tag")}</span>
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="all">{t("filters.allTags")}</option>
                  {allTags.map((tg) => (
                    <option key={tg.id} value={tg.id}>
                      {tg.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="filters-views-label">{t("savedViews.heading")}</div>
          <div className="saved-views">
            {savedViews.map((v) => (
              <span
                key={v.id}
                className={`view-chip${JSON.stringify(boardFields(v.filters)) === curFilterKey ? " active" : ""}`}
              >
                <button className="view-apply" onClick={() => applyView(v)}>
                  {v.name}
                </button>
                <button
                  className="view-del"
                  aria-label={t("savedViews.delete", { name: v.name })}
                  onClick={() => deleteView(v.id)}
                >
                  ×
                </button>
              </span>
            ))}
            <button className="view-save" onClick={() => setNamingView(true)}>
              {t("savedViews.save")}
            </button>
          </div>
        </div>
      )}

      {namingView && (
        <Dialog label={t("savedViews.save")} onClose={() => setNamingView(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveCurrentView();
            }}
          >
            <label className="settings-field">
              <span>{t("savedViews.namePrompt")}</span>
              <input
                autoFocus
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                type="submit"
                className="primary"
                disabled={!newViewName.trim()}
              >
                {t("common.save")}
              </button>
              <button type="button" onClick={() => setNamingView(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      <BoardTab
        applications={filtered}
        attention={attention}
        sort={sort}
        companies={companies}
        contacts={contacts}
        roleTypes={roleTypes}
        onChanged={onChanged}
        onError={onError}
        notify={notify}
        onDelete={onDelete}
        onStatus={onStatus}
        initialDetailId={null}
        onDetailIdChange={onOpenJob}
      />

      {showArchivedModal && (
        <Dialog
          label={t("board.archivedTitle")}
          onClose={() => setShowArchivedModal(false)}
          className="archived-modal"
        >
          <div className="archived-head">
            <h2>{t("board.archivedTitle")}</h2>
            <span className="mono small muted">{inactive.length}</span>
          </div>
          {inactive.length === 0 ? (
            <p className="muted small">{t("board.noArchived")}</p>
          ) : (
            <>
            <div className="archived-tabs">
              {archivedTabs.map((tobj) => (
                <button
                  key={tobj.key}
                  type="button"
                  className={`chip${archivedFilter === tobj.key ? " active" : ""}`}
                  onClick={() => setArchivedFilter(tobj.key)}
                >
                  {tobj.key === "all"
                    ? t("board.archAll")
                    : t(
                        `board.reason${tobj.key[0].toUpperCase()}${tobj.key.slice(1)}`,
                      )}{" "}
                  <span className="chip-n">{tobj.n}</span>
                </button>
              ))}
            </div>
            <ul className="archived-list">
              {shownArchived.map((a) => {
                const reasonKey =
                  reasonOf(a) === "rejected"
                    ? "reasonRejected"
                    : reasonOf(a) === "withdrawn"
                      ? "reasonWithdrawn"
                      : reasonOf(a) === "ghosted"
                        ? "reasonGhosted"
                        : "reasonArchived";
                const restore = () =>
                  (a.archived_at
                    ? api.unarchiveApplication(a.id).then(() => onChanged())
                    : Promise.resolve(onStatus(a.id, "interested"))
                  )
                    .then(() => setShowArchivedModal(false))
                    .catch((e) => onError((e as Error).message));
                return (
                  <li key={a.id}>
                    <button
                      className="archived-open"
                      onClick={() => {
                        setShowArchivedModal(false);
                        onOpenJob(a.id);
                      }}
                    >
                      <span className="archived-title">{a.title}</span>
                      <span className="archived-co muted">
                        {a.company_name ?? "—"}
                      </span>
                    </button>
                    <span className="archived-reason">{t(`board.${reasonKey}`)}</span>
                    <button className="archived-restore" onClick={restore}>
                      {t("board.restore")} ›
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </Dialog>
      )}

    </section>
  );
}
