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
  FUNNEL_STAGES,
  funnelConversions,
  funnelReachCounts,
  responseRate,
  medianTimeInStageDays,
} from "./stats";
import {
  type CrudTabProps,
  type Stats,
  STATUSES,
  type Application,
  type Company,
  type Contact,
  type Document,
  type SavedView,
  type JobFilters,
  type RoleTypeDef,
  type Status,
  type Profile,
  type WorkExperience,
  type Skill,
  type StatusHistoryRow,
  type PrepItem,
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
  ageDays,
  annualizedComp,
  buildNegotiationDraft,
  computePipelineMomentum,
  computeWeeklyMomentum,
  downloadOfferComparisonPdf,
  formatComp,
  formatDate,
  isDead,
  isDeadlinePast,
  isDeadlineSoon,
  isDue,
  isOverdue,
  median,
  medianTimeToOffer,
  parseSqlDate,
  safeHref,
  sortCards,
  today,
  totalComp,
  totalCompBreakdown,
  CV_LANG_KEY,
  getCvLanguage,
} from "./format";
import type { BoardSort, Urgency } from "./format";
import { ConfirmHost, Dialog, LoadingSkeleton } from "./ui";
import {
  requestConfirm,
  rowActivate,
  useFocusTrap,
  useSubmitGuard,
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
import { Timeline } from "./timeline";
import { CompaniesTab, ContactsTab } from "./network";
import { CVTab } from "./cv";
import { ActivityTab, CalendarTab } from "./calendar";

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

const UNKNOWN_SOURCE = "__unknown_source__";

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
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

function Documents({
  applicationId,
  onError,
}: {
  applicationId: number;
  onError: (message: string | null) => void;
}) {
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
    <div className="docs">
      <div className="docs-add">
        <input
          placeholder={t("documents.labelPlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className={`upload-btn${busy ? " busy" : ""}`}>
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
      <ul className="docs-items">
        {(items ?? []).map((d) => (
          <li key={d.id}>
            <a href={`/api/documents/${d.id}/download`} download>
              {d.filename}
            </a>
            {d.label && <span className="doc-label">{d.label}</span>}
            <span className="doc-size">{formatSize(d.size)}</span>
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

function StatsTab({
  stats,
  fullApps,
}: {
  stats: Stats | null;
  fullApps: Application[];
}) {
  const { t } = useTranslation();
  if (!stats) return <LoadingSkeleton />;
  const { applications: apps, history } = stats;

  const comparing = (fullApps ?? [])
    .filter((a) => a.status === "interview" || a.status === "offer")
    .sort((a, b) => (annualizedComp(b) ?? -1) - (annualizedComp(a) ?? -1));

  // Applications per week + streak via the shared helper above.
  const now = Date.now();
  const { weeks } = computeWeeklyMomentum(apps, history);
  const weekMax = Math.max(1, ...weeks.map((w) => w.count));

  // Furthest pipeline stage each application ever reached
  const reachedByApp = new Map<number, number>();
  for (const row of history) {
    const idx = PIPELINE.indexOf(row.to_status);
    if (idx < 0) continue;
    const prev = reachedByApp.get(row.application_id) ?? -1;
    if (idx > prev) reachedByApp.set(row.application_id, idx);
  }
  const funnel = PIPELINE.map((stage, i) => ({
    stage,
    count: [...reachedByApp.values()].filter((r) => r >= i).length,
  }));
  const funnelMax = Math.max(1, funnel[0].count);

  // Average days spent per pipeline stage
  const stageDays = new Map<string, { total: number; n: number }>();
  const byApp = new Map<number, typeof history>();
  for (const row of history) {
    const list = byApp.get(row.application_id) ?? [];
    list.push(row);
    byApp.set(row.application_id, list);
  }
  for (const rows of byApp.values()) {
    for (let i = 0; i < rows.length; i++) {
      const stage = rows[i].to_status;
      if (!PIPELINE.includes(stage)) continue;
      const start = parseSqlDate(rows[i].changed_at);
      const end =
        i + 1 < rows.length ? parseSqlDate(rows[i + 1].changed_at) : now;
      const cur = stageDays.get(stage) ?? { total: 0, n: 0 };
      cur.total += (end - start) / 86400000;
      cur.n += 1;
      stageDays.set(stage, cur);
    }
  }

  // Time to offer (#226) — days from the "applied" transition to the
  // "offer" transition, per application that reached offer. Median
  // rather than mean since a single very slow (or very fast) employer
  // shouldn't skew a number meant to set expectations.
  const offerDurations: number[] = [];
  for (const rows of byApp.values()) {
    const appliedRow = rows.find((r) => r.to_status === "applied");
    const offerRow = rows.find((r) => r.to_status === "offer");
    if (appliedRow && offerRow) {
      const days =
        (parseSqlDate(offerRow.changed_at) - parseSqlDate(appliedRow.changed_at)) /
        86400000;
      if (days >= 0) offerDurations.push(days);
    }
  }
  const timeToOffer = median(offerDurations);

  // Ghost rate per source
  const bySource = new Map<string, { total: number; ghosted: number }>();
  for (const a of apps) {
    const src = a.source?.trim() || UNKNOWN_SOURCE;
    const cur = bySource.get(src) ?? { total: 0, ghosted: 0 };
    cur.total += 1;
    if (a.status === "ghosted") cur.ghosted += 1;
    bySource.set(src, cur);
  }

  // Pipeline velocity: forward stage advances (never backward/lateral) in
  // the last 14 days vs the 14 days before that — a single headline signal
  // for whether the search overall is speeding up or stalling, distinct
  // from the per-stage funnel/time-in-stage breakdowns below.
  const PERIOD = 14 * 86400000;
  const isForwardMove = (row: (typeof history)[number]) => {
    const toIdx = PIPELINE.indexOf(row.to_status);
    const fromIdx = row.from_status ? PIPELINE.indexOf(row.from_status) : -1;
    return toIdx >= 0 && toIdx > fromIdx;
  };
  const recentMoves = history.filter(
    (h) => isForwardMove(h) && parseSqlDate(h.changed_at) >= now - PERIOD,
  ).length;
  const priorMoves = history.filter(
    (h) =>
      isForwardMove(h) &&
      parseSqlDate(h.changed_at) >= now - 2 * PERIOD &&
      parseSqlDate(h.changed_at) < now - PERIOD,
  ).length;
  let momentum: "up" | "down" | "flat" | "none";
  if (recentMoves === 0 && priorMoves === 0) momentum = "none";
  else if (priorMoves === 0) momentum = "up";
  else {
    const change = (recentMoves - priorMoves) / priorMoves;
    momentum = change > 0.15 ? "up" : change < -0.15 ? "down" : "flat";
  }

  // Stats v2 (#275) — conversion, response rate, median time-in-stage,
  // computed by the pure helpers in stats.ts.
  const conversions = funnelConversions(history);
  const response = responseRate(history);
  const medianStage = new Map(
    medianTimeInStageDays(history, now).map((s) => [s.stage, s.median]),
  );

  return (
    <section className="stats">
      <div className={`momentum momentum-${momentum}`}>
        <span className="momentum-label">{t("stats.momentumLabel")}</span>
        <span className="momentum-value">{t(`stats.momentum.${momentum}`)}</span>
        <span className="muted small">
          {t("stats.momentumDetail", { recent: recentMoves, prior: priorMoves })}
        </span>
      </div>

      <div className="stats-grid">
      <div className="stat-block">
      <h2 className="stat-h">{t("stats.appsPerWeek")}</h2>
      <div className="histo">
        {weeks.map((w) => (
          <div key={w.label} className="hrow" title={t("stats.weekOfTitle", { label: w.label, count: w.count })}>
            <span className="lbl">{w.label}</span>
            <span className="htrack">
              <span
                className="hfill accent-fill"
                style={{ width: `${(w.count / weekMax) * 100}%`, display: "block" }}
              />
            </span>
            <span className="n">{w.count}</span>
          </div>
        ))}
      </div>

      </div>
      <div className="stat-block">
      <h2 className="stat-h">{t("stats.pipelineFunnel")}</h2>
      <div className="histo">
        {funnel.map((f) => (
          <div
            key={f.stage}
            className={`hrow stage-${f.stage}`}
            title={t("stats.reachedTitle", { count: f.count, stage: t(`stages.${f.stage}`) })}
          >
            <span className="lbl">{t(`stages.${f.stage}`)}</span>
            <span className="htrack">
              <span
                className="hfill"
                style={{ width: `${(f.count / funnelMax) * 100}%`, display: "block" }}
              />
            </span>
            <span className="n">{f.count}</span>
          </div>
        ))}
      </div>

      </div>
      <div className="stat-block">
      {response.applied > 0 && (
        <p className="stat-callout">
          {t("stats.responseRate", {
            responded: response.responded,
            applied: response.applied,
            pct: Math.round(response.rate * 100),
          })}
        </p>
      )}

      {conversions.some((c) => c.prev > 0) && (
        <>
          <h2 className="stat-h">{t("stats.conversion")}</h2>
          <ul className="stat-list">
            {conversions
              .filter((c) => c.prev > 0)
              .map((c) => (
                <li key={`${c.from}-${c.to}`} className={`stage-${c.to}`}>
                  <span className="stat-dot" aria-hidden="true" />
                  <span className="stage-name">
                    {t(`stages.${c.from}`)} → {t(`stages.${c.to}`)}
                  </span>
                  <span className="stat-val">{Math.round(c.rate * 100)}%</span>
                </li>
              ))}
          </ul>
        </>
      )}

      {timeToOffer != null && (
        <p className="stat-callout">
          {t("stats.timeToOffer", { count: Math.round(timeToOffer), n: offerDurations.length })}
        </p>
      )}

      </div>
      <div className="stat-block">
      <h2 className="stat-h">{t("stats.avgTimeInStage")}</h2>
      <ul className="stat-list">
        {PIPELINE.filter((s) => stageDays.has(s)).map((s) => {
          const d = stageDays.get(s)!;
          const med = medianStage.get(s);
          return (
            <li key={s} className={`stage-${s}`}>
              <span className="stat-dot" aria-hidden="true" />
              <span className="stage-name">{t(`stages.${s}`)}</span>
              <span className="stat-val">
                {(d.total / d.n).toFixed(1)}d {t("stats.avgLabel")}
                {med != null
                  ? ` · ${med.toFixed(1)}d ${t("stats.medianLabel")}`
                  : ""}
              </span>
            </li>
          );
        })}
        {stageDays.size === 0 && <li className="tl-empty">{t("stats.noHistory")}</li>}
      </ul>

      </div>
      <div className="stat-block">
      <h2 className="stat-h">{t("stats.ghostRate")}</h2>
      <ul className="stat-list">
        {[...bySource.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([src, v]) => (
            <li key={src}>
              <span>{src === UNKNOWN_SOURCE ? t("stats.unknownSource") : src}</span>
              <span className="muted small">{v.total} apps</span>
              <span className="stat-val">
                {t("stats.ghostedPercent", { pct: Math.round((v.ghosted / v.total) * 100) })}
              </span>
            </li>
          ))}
        {bySource.size === 0 && <li className="tl-empty">{t("stats.noApplications")}</li>}
      </ul>

      </div>
      <div className="stat-block stat-block-wide">
      <h2 className="stat-h">{t("stats.compare")}</h2>
      {comparing.some((a) => a.status === "offer") && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadOfferComparisonPdf(comparing.filter((a) => a.status === "offer"), t)}
        >
          {t("stats.downloadOfferComparison")}
        </button>
      )}
      <div className="compare-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>{t("stats.colRole")}</th>
              <th>{t("stats.colCompany")}</th>
              <th>{t("stats.colStage")}</th>
              <th>{t("stats.colComp")}</th>
              <th>{t("offer.totalComp")}</th>
              <th>{t("stats.colNotes")}</th>
            </tr>
          </thead>
          <tbody>
            {comparing.map((a) => {
              const total = totalComp(a);
              return (
                <tr key={a.id} className={`stage-${a.status}`}>
                  <td>{a.title}</td>
                  <td>{a.company_name ?? "—"}</td>
                  <td>
                    <span className="badge stage">{t(`stages.${a.status}`)}</span>
                  </td>
                  <td className="compare-comp">{formatComp(a)}</td>
                  <td className="compare-comp" title={totalCompBreakdown(a)}>
                    {total != null
                      ? `~${a.salary_currency ?? ""} ${Math.round(total).toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="compare-notes">{a.notes ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {comparing.length === 0 && (
          <p className="tl-empty">{t("stats.compareEmpty")}</p>
        )}
      </div>

      <h2 className="stat-h">{t("stats.exportData")}</h2>
      <p className="export-links">
        <a href="/api/export" download>
          {t("stats.exportAllJson")}
        </a>
        {["applications", "companies", "contacts", "interactions"].map(
          (res) => (
            <a key={res} href={`/api/export/${res}.csv`} download>
              {res} (CSV)
            </a>
          ),
        )}
      </p>
      </div>
      </div>
    </section>
  );
}

const PREP_STARTER_ITEMS = [
  "prep.starterResearch",
  "prep.starterQuestions",
  "prep.starterJd",
  "prep.starterStories",
] as const;

function InterviewPrepSection({
  applicationId,
  onError,
}: {
  applicationId: number;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<PrepItem[] | null>(null);
  const [newText, setNewText] = useState("");

  const load = useCallback(
    () =>
      api
        .list<PrepItem>(`applications/${applicationId}/prep-items`)
        .then(setItems)
        .catch((e) => onError((e as Error).message)),
    [applicationId, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const [adding, setAdding] = useState(false);
  const addItem = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    api
      .create(`applications/${applicationId}/prep-items`, { text: trimmed })
      .then(() => {
        setNewText("");
        return load();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setAdding(false));
  };

  const toggleDone = (item: PrepItem) =>
    api
      .update("prep-items", item.id, { done: !item.done })
      .then(load)
      .catch((e) => onError((e as Error).message));

  const removeItem = (id: number) =>
    api
      .remove("prep-items", id)
      .then(load)
      .catch((e) => onError((e as Error).message));

  // Reorder via sort_order swap (#207) — same pattern as the CV
  // sections (#94) rather than native drag, which is deliberately
  // gated off on touch input elsewhere in this app (see Board, #54).
  const moveItem = (index: number, dir: -1 | 1) => {
    if (!items) return;
    const other = items[index + dir];
    const item = items[index];
    if (!other) return;
    Promise.all([
      api.update("prep-items", item.id, { sort_order: other.sort_order }),
      api.update("prep-items", other.id, { sort_order: item.sort_order }),
    ])
      .then(load)
      .catch((e) => onError((e as Error).message));
  };

  const addStarterChecklist = () => {
    Promise.all(
      PREP_STARTER_ITEMS.map((key) =>
        api.create(`applications/${applicationId}/prep-items`, {
          text: t(key),
        }),
      ),
    )
      .then(load)
      .catch((e) => onError((e as Error).message));
  };

  if (!items) return null;

  return (
    <div className="prep-checklist">
      {items.length === 0 && (
        <button onClick={addStarterChecklist}>
          {t("prep.addStarterChecklist")}
        </button>
      )}
      <ul>
        {items.map((item, i) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={!!item.done}
                onChange={() => toggleDone(item)}
              />
              {item.text}
            </label>
            <span className="prep-item-actions">
              <button
                aria-label={t("cv.moveUp")}
                disabled={i === 0}
                onClick={() => moveItem(i, -1)}
              >
                ↑
              </button>
              <button
                aria-label={t("cv.moveDown")}
                disabled={i === items.length - 1}
                onClick={() => moveItem(i, 1)}
              >
                ↓
              </button>
              <button
                className="danger"
                onClick={() => removeItem(item.id)}
                aria-label={t("common.delete")}
              >
                <RemoveIcon />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="prep-add">
        <input
          placeholder={t("prep.addItemPlaceholder")}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem(newText);
            }
          }}
        />
        <button disabled={adding} onClick={() => addItem(newText)}>
          {t("common.add")}
        </button>
      </div>
    </div>
  );
}

function CoverLetterSection({
  application,
  onChanged,
  onError,
  notify,
}: {
  application: Application;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(application.cover_letter ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(application.cover_letter ?? "");
  }, [application.id, application.cover_letter]);

  const [generating, setGenerating] = useState(false);
  const generate = () => {
    if (generating) return;
    setGenerating(true);
    api
      .profile()
      .then((profile) => {
        const company = application.company_name ?? t("coverLetter.theCompany");
        const greeting = t("coverLetter.greeting", { company });
        const body = t("coverLetter.body", {
          title: application.title,
          company,
          summary: profile.summary ?? t("coverLetter.summaryPlaceholder"),
        });
        const signoff = t("coverLetter.signoff", {
          name: profile.name ?? t("coverLetter.namePlaceholder"),
        });
        setText(`${greeting}\n\n${body}\n\n${signoff}`);
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setGenerating(false));
  };

  const save = () => {
    setSaving(true);
    api
      .update("applications", application.id, { ...application, cover_letter: text })
      .then(() => {
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="cover-letter">
      <div className="cover-letter-actions">
        <button onClick={generate} disabled={generating}>
          {t("coverLetter.generateDraft")}
        </button>
        <button className="primary" disabled={saving} onClick={save}>
          {t("common.save")}
        </button>
      </div>
      <textarea
        rows={10}
        placeholder={t("coverLetter.placeholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

function JdKeywordMatch({
  onError,
  initialText,
}: {
  onError: (message: string | null) => void;
  initialText?: string;
}) {
  const { t } = useTranslation();
  const [jdText, setJdText] = useState(initialText ?? "");
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [cvSkillNames, setCvSkillNames] = useState<Set<string> | null>(null);

  const load = () => {
    if (skills) return;
    Promise.all([
      api.list<Skill>("skills"),
      api.list<WorkExperience>("work-experience"),
    ])
      .then(([allSkills, workExp]) => {
        setSkills(allSkills);
        setCvSkillNames(
          new Set(
            workExp.flatMap((w) => w.skills.map((s) => s.name.toLowerCase())),
          ),
        );
      })
      .catch((e) => onError((e as Error).message));
  };

  useEffect(() => {
    if (initialText) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jdLower = jdText.toLowerCase();
  const mentioned =
    jdText.trim() && skills
      ? skills.filter((s) => {
          const escaped = s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`\\b${escaped}\\b`, "i").test(jdLower);
        })
      : [];
  const matched = mentioned.filter((s) =>
    cvSkillNames?.has(s.name.toLowerCase()),
  );

  return (
    <div className="jd-match">
      <textarea
        className="jd-match-input"
        placeholder={t("detail.pasteJdPlaceholder")}
        value={jdText}
        onFocus={load}
        onChange={(e) => setJdText(e.target.value)}
        rows={4}
      />
      {jdText.trim() && skills && (
        <div className="jd-match-result">
          <strong>
            {t("detail.keywordMatchCount", {
              matched: matched.length,
              total: mentioned.length,
            })}
          </strong>
          <div className="keyword-chips">
            {mentioned.map((s) => (
              <span
                key={s.id}
                className={`chip${matched.includes(s) ? " chip-matched" : ""}`}
              >
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApplicationDetailModal({
  application,
  allApplications,
  companies,
  contacts,
  roleTypes,
  onClose,
  onChanged,
  onError,
  notify,
  onDelete,
  onStatus,
  asPane,
}: {
  application: Application;
  allApplications: Application[];
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
  onDelete: (resource: string, id: number, name: string) => void;
  onStatus: (id: number, status: Status) => void;
  // Split-pane mode (#131) — rendered inline in the Jobs sidebar on wide
  // desktop viewports instead of an overlay modal. Same content either
  // way; only the outer wrapper (backdrop, click-outside-to-close,
  // Escape-to-close) differs.
  asPane?: boolean;
}) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>(!asPane);
  const [editing, setEditing] = useState(false);
  const [inlineField, setInlineField] = useState<null | "followup" | "notes">(
    null,
  );
  const [fuText, setFuText] = useState("");
  const [fuDate, setFuDate] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [patchBusy, setPatchBusy] = useState(false);
  const inlinePatch = (req: Promise<unknown>) => {
    if (patchBusy) return;
    setPatchBusy(true);
    return req
      .then(() => {
        setInlineField(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setPatchBusy(false));
  };
  const [newTag, setNewTag] = useState("");
  const [negotiationDraft, setNegotiationDraft] = useState<string | null>(null);
  const a = application;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (inlineField) {
        // Close just the small inline editor — not the whole panel.
        setInlineField(null);
      } else if (editing) {
        // The full form holds ~20 fields; Escape used to discard them
        // silently (modal) or do nothing (page).
        void requestConfirm(t("confirm.discardEdit")).then((ok) => {
          if (ok) setEditing(false);
        });
      } else if (!asPane) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, asPane, editing, inlineField, t]);

  const addTag = () => {
    const name = newTag.trim();
    if (!name) return;
    api
      .addApplicationTag(a.id, name)
      .then(() => {
        setNewTag("");
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  // Reorder via sort_order swap (#207), same pattern as prep items and
  // the CV sections (#94) — array index doubles as the new sort key
  // since a.tags already arrives ordered by sort_order.
  const moveTag = (index: number, dir: -1 | 1) => {
    const other = a.tags[index + dir];
    const item = a.tags[index];
    if (!other) return;
    Promise.all([
      api.reorderApplicationTag(a.id, item.id, index + dir),
      api.reorderApplicationTag(a.id, other.id, index),
    ])
      .then(onChanged)
      .catch((e) => onError((e as Error).message));
  };

  const [printingCheatSheet, setPrintingCheatSheet] = useState(false);
  const printCheatSheet = async () => {
    setPrintingCheatSheet(true);
    try {
      const company = companies.find((c) => c.id === a.company_id) ?? null;
      const contact = contacts.find((c) => c.id === a.contact_id) ?? null;
      const [prepItems, interactions] = await Promise.all([
        api.list<PrepItem>(`applications/${a.id}/prep-items`),
        api.interactions("applications", a.id),
      ]);
      const { generateInterviewCheatSheet } = await import("./pdf");
      const doc = generateInterviewCheatSheet(
        {
          title: a.title,
          companyName: company?.name ?? a.company_name ?? null,
          companyWebsite: company?.website ?? null,
          companyDescription: company?.description ?? null,
          contactName: contact?.name ?? a.contact_name ?? null,
          contactRole: contact?.role ?? null,
          contactEmail: contact?.email ?? null,
          contactPhone: contact?.phone ?? null,
          notes: a.notes,
          prepItems,
          interactions,
        },
        {
          contact: t("detail.cheatSheet.contact"),
          companyResearch: t("detail.cheatSheet.companyResearch"),
          prepChecklist: t("prep.title"),
          pastInteractions: t("detail.timeline"),
          noNotes: t("detail.cheatSheet.noNotes"),
        },
      );
      doc.save(`${a.title.replace(/\s+/g, "-")}-cheat-sheet.pdf`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setPrintingCheatSheet(false);
    }
  };

  const pane = (
      <div
        ref={dialogRef}
        className={asPane ? "detail-pane" : "modal detail-modal"}
        onClick={asPane ? undefined : (e) => e.stopPropagation()}
        role={asPane ? "region" : "dialog"}
        aria-modal={asPane ? undefined : true}
        aria-label={a.title}
      >
        <div className="detail-head">
          <div>
            <h2>{a.title}</h2>
            <span className="muted small">
              {a.company_name ?? "—"}
              {a.contact_name ? ` · ${a.contact_name}` : ""}
            </span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </div>

        {editing ? (
          <ApplicationForm
            initial={a}
            companies={companies}
            contacts={contacts}
            roleTypes={roleTypes}
            applications={allApplications}
            onError={onError}
            onCancel={() => setEditing(false)}
            onSubmit={(data) =>
              api
                .update("applications", a.id, data)
                .then(() => {
                  setEditing(false);
                  notify(t("common.saved"));
                  return onChanged();
                })
                .catch((e) => onError((e as Error).message))
            }
          />
        ) : (
          <>
          {/* Two-column job page (#314): facts/actions left, content
              sections right — CSS collapses this to one column in the
              modal/narrow contexts. */}
          <div className="detail-cols">
          <div className="detail-primary">
            <div className="detail-fields">
              <div>
                <span className="field-label">{t("detail.status")}</span>
                <select
                  className={`status stage-${a.status}`}
                  value={a.status}
                  onChange={(e) => onStatus(a.id, e.target.value as Status)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`stages.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="field-label">{t("detail.role")}</span>
                <span className="muted small">
                  {roleTypes.find((r) => r.slug === a.role_type)?.label ??
                    a.role_type}
                </span>
              </div>
              <div>
                <span className="field-label" id={`fit-label-${a.id}`}>
                  {t("detail.fitScore")}
                </span>
                <span
                  className="fit-edit"
                  role="radiogroup"
                  aria-labelledby={`fit-label-${a.id}`}
                  onKeyDown={(e) => {
                    // Arrow/Home/End move the rating like a real radiogroup
                    // (#346) — the stars were five separate toggles before.
                    const cur = a.fit_score ?? 0;
                    let next: number | null = null;
                    if (e.key === "ArrowRight" || e.key === "ArrowUp")
                      next = Math.min(5, (cur || 0) + 1);
                    else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
                      next = Math.max(1, (cur || 1) - 1);
                    else if (e.key === "Home") next = 1;
                    else if (e.key === "End") next = 5;
                    else return;
                    e.preventDefault();
                    if (next !== cur && !patchBusy)
                      inlinePatch(
                        api.patchApplication(a.id, { fit_score: next }),
                      );
                  }}
                >
                  {[1, 2, 3, 4, 5].map((n) => {
                    const checked = (a.fit_score ?? 0) === n;
                    // Roving tabindex: only the checked star (or the first,
                    // when unset) is tabbable; arrows move within the group.
                    const tabbable = checked || (!a.fit_score && n === 1);
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={tabbable ? 0 : -1}
                        disabled={patchBusy}
                        className={`fit-star${(a.fit_score ?? 0) >= n ? " on" : ""}`}
                        aria-label={t("detail.fitSetAria", { n })}
                        onClick={() =>
                          inlinePatch(
                            api.patchApplication(a.id, {
                              fit_score: a.fit_score === n ? null : n,
                            }),
                          )
                        }
                      >
                        ★
                      </button>
                    );
                  })}
                </span>
              </div>
              {safeHref(a.url) && (
                <a href={safeHref(a.url)} target="_blank" rel="noreferrer" className="small">
                  {t("detail.jobPostingLink")}
                </a>
              )}
              {a.source && <span className="muted small">{t("detail.viaSource", { source: a.source })}</span>}
              {a.posting_status === "maybe_stale" && (
                <span className="muted small warn-text">
                  {t("posting.staleHint")}
                </span>
              )}
              {a.referred_by_name && (
                <span className="muted small">
                  {t("referral.referredBy")}: {a.referred_by_name}
                </span>
              )}
              {a.deadline_at && (
                <span
                  className={`small${isDeadlinePast(a) ? " warn-text" : isDeadlineSoon(a) ? " warn-text" : ""}`}
                >
                  {t("detail.deadline")}: {formatDate(a.deadline_at)}
                </span>
              )}
              {a.salary_range && (
                <span className="muted small">{a.salary_range}</span>
              )}
              {a.status === "offer" && totalComp(a) != null && (
                <span className="muted small" title={totalCompBreakdown(a)}>
                  {t("offer.totalComp")}: ~
                  {a.salary_currency ?? ""}{" "}
                  {Math.round(totalComp(a)!).toLocaleString()}
                </span>
              )}
              {a.status === "offer" &&
                totalComp(a) != null &&
                (() => {
                  const others = allApplications.filter(
                    (o) =>
                      o.id !== a.id &&
                      o.status === "offer" &&
                      totalComp(o) != null,
                  );
                  const sameRole = others.filter(
                    (o) => o.role_type === a.role_type,
                  );
                  const pool = sameRole.length ? sameRole : others;
                  if (!pool.length) return null;
                  const med = median(pool.map((o) => totalComp(o)!));
                  if (med == null || med === 0) return null;
                  const diffPct = ((totalComp(a)! - med) / med) * 100;
                  return (
                    <span className="muted small">
                      {t("offer.benchmark", {
                        pct: Math.round(Math.abs(diffPct)),
                        direction:
                          diffPct >= 0 ? t("offer.above") : t("offer.below"),
                        n: pool.length,
                      })}
                    </span>
                  );
                })()}
              {a.status === "offer" && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setNegotiationDraft((cur) =>
                      cur == null ? buildNegotiationDraft(a, allApplications, t) : null,
                    )
                  }
                >
                  {negotiationDraft == null
                    ? t("offer.draftNegotiation")
                    : t("offer.hideNegotiationDraft")}
                </button>
              )}
              {negotiationDraft != null && (
                <div className="negotiation-draft">
                  <textarea
                    rows={8}
                    value={negotiationDraft}
                    onChange={(e) => setNegotiationDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(negotiationDraft)}
                  >
                    {t("offer.copyDraft")}
                  </button>
                </div>
              )}
              {a.applied_at && (
                <span className="muted small">
                  {t("detail.appliedDate", { date: formatDate(a.applied_at) })}
                </span>
              )}
              {inlineField === "followup" ? (
                <form
                  className="inline-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    inlinePatch(
                      api.updateFollowUp(a.id, {
                        next_action: fuText.trim() || null,
                        next_action_at: fuDate || null,
                      }),
                    );
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
                  <div className="inline-edit-actions">
                    <button type="submit" className="primary" disabled={patchBusy}>
                      {t("common.save")}
                    </button>
                    <button type="button" onClick={() => setInlineField(null)}>
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              ) : a.next_action || a.next_action_at ? (
                <span
                  className={`due-line${isOverdue(a) ? " late" : isDue(a) ? " today" : ""}`}
                >
                  → {a.next_action ?? t("detail.followUpFallback")}
                  {a.next_action_at ? ` · ${formatDate(a.next_action_at)}` : ""}
                  <button
                    type="button"
                    className="inline-edit-open"
                    aria-label={t("detail.editFollowUp")}
                    onClick={() => {
                      setFuText(a.next_action ?? "");
                      setFuDate(a.next_action_at?.slice(0, 10) ?? "");
                      setInlineField("followup");
                    }}
                  >
                    ✎
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setFuText("");
                    setFuDate("");
                    setInlineField("followup");
                  }}
                >
                  {t("detail.setFollowUp")}
                </button>
              )}
              {inlineField === "notes" ? (
                <form
                  className="inline-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    inlinePatch(
                      api.patchApplication(a.id, {
                        notes: noteDraft.trim() || null,
                      }),
                    );
                  }}
                >
                  <textarea
                    rows={4}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    autoFocus
                  />
                  <div className="inline-edit-actions">
                    <button type="submit" className="primary" disabled={patchBusy}>
                      {t("common.save")}
                    </button>
                    <button type="button" onClick={() => setInlineField(null)}>
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              ) : a.notes ? (
                <p className="notes">
                  {a.notes}
                  <button
                    type="button"
                    className="inline-edit-open"
                    aria-label={t("detail.editNotes")}
                    onClick={() => {
                      setNoteDraft(a.notes ?? "");
                      setInlineField("notes");
                    }}
                  >
                    ✎
                  </button>
                </p>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setNoteDraft("");
                    setInlineField("notes");
                  }}
                >
                  {t("detail.addNote")}
                </button>
              )}
              {a.job_description && (
                <details className="jd-snapshot">
                  <summary>
                    {t("detail.jobDescription")}
                    {a.job_description_captured_at && (
                      <span className="muted small">
                        {" "}
                        —{" "}
                        {t("detail.jobDescriptionCaptured", {
                          date: formatDate(a.job_description_captured_at),
                        })}
                      </span>
                    )}
                  </summary>
                  <p className="notes">{a.job_description}</p>
                </details>
              )}
            </div>

            <div className="keyword-chips">
              {a.tags.map((tg, i) => (
                <span key={tg.id} className="chip">
                  <button
                    className="chip-move"
                    aria-label={t("cv.moveUp")}
                    disabled={i === 0}
                    onClick={() => moveTag(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="chip-move"
                    aria-label={t("cv.moveDown")}
                    disabled={i === a.tags.length - 1}
                    onClick={() => moveTag(i, 1)}
                  >
                    ↓
                  </button>
                  {tg.name}
                  <button
                    onClick={() =>
                      api
                        .removeApplicationTag(a.id, tg.id)
                        .then(onChanged)
                        .catch((e) => onError((e as Error).message))
                    }
                    aria-label={t("feedSettings.removeKeyword")}
                  >
                    <RemoveIcon />
                  </button>
                </span>
              ))}
              <input
                placeholder={t("detail.addTag")}
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
            </div>

            <div className="detail-actions">
              <button onClick={() => setEditing(true)}>{t("common.edit")}</button>
              <button disabled={printingCheatSheet} onClick={printCheatSheet}>
                {printingCheatSheet
                  ? t("detail.cheatSheet.printing")
                  : t("detail.cheatSheet.print")}
              </button>
              <button
                onClick={() =>
                  (a.archived_at
                    ? api.unarchiveApplication(a.id)
                    : api.archiveApplication(a.id)
                  )
                    .then(onChanged)
                    .catch((e) => onError((e as Error).message))
                }
              >
                {a.archived_at
                  ? t("detail.unarchive")
                  : t("detail.archive")}
              </button>
              <button
                className="danger"
                onClick={() => {
                  onDelete("applications", a.id, a.title);
                  onClose();
                }}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
          <div className="detail-secondary">
            <h3 className="detail-sub">{t("prep.title")}</h3>
            <InterviewPrepSection applicationId={a.id} onError={onError} />

            <h3 className="detail-sub">{t("coverLetter.title")}</h3>
            <CoverLetterSection
              application={a}
              onChanged={onChanged}
              onError={onError}
              notify={notify}
            />

            <h3 className="detail-sub">{t("detail.keywordMatch")}</h3>
            <JdKeywordMatch
              onError={onError}
              initialText={a.job_description ?? undefined}
            />

            <h3 className="detail-sub">{t("detail.timeline")}</h3>
            <Timeline
              resource="applications"
              targetId={a.id}
              onError={onError}
              onLogged={() => void onChanged()}
            />

            <h3 className="detail-sub">{t("detail.documents")}</h3>
            <Documents applicationId={a.id} onError={onError} />
          </div>
          </div>
          </>
        )}
      </div>
  );

  if (asPane) return pane;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      {pane}
    </div>
  );
}

// Quick-add sheet (#314) — the FAB opens four fields, not the 23-field
// full form. "Add & open" lands on the new job's detail page where
// everything else lives.
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
function DashboardTab({
  applications,
  fullApps,
  onGoToJobs,
  onOpenJob,
  onError,
  onChanged,
  stats,
  notify,
  onOpenQuickAdd,
}: {
  applications: Application[];
  fullApps: Application[];
  onGoToJobs: () => void;
  onOpenJob: (id: number) => void;
  onError: (message: string | null) => void;
  onChanged: () => Promise<unknown> | void;
  stats: Stats | null;
  notify: (message: string, undo?: () => void, label?: string) => void;
  onOpenQuickAdd: () => void;
}) {
  const { t } = useTranslation();
  const [showActivity, setShowActivity] = useState(false);
  if (!stats) return <LoadingSkeleton />;
  const history = stats.history;
  const open = applications.filter((a) => !isDead(a.status));
  const upcoming = applications.filter(
    (a) => a.next_action_at && !isDead(a.status),
  );
  const hasActions = upcoming.length > 0;

  const counts = funnelReachCounts(history);
  const funnelMax = Math.max(1, counts[0] ?? 0);
  const conv = funnelConversions(history);
  const resp = responseRate(history);
  const mom = computeWeeklyMomentum(stats.applications, history);
  const weekMax = Math.max(1, ...mom.weeks.map((w) => w.count));
  const pipe = computePipelineMomentum(history);
  const t2o = medianTimeToOffer(history);
  const liveOffers = applications.filter((a) => a.status === "offer");
  const comps = liveOffers
    .map((o) => totalComp(o))
    .filter((x): x is number => x != null);
  const topComp = comps.length ? Math.max(...comps) : null;
  const recent = [...applications]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);

  const fmtComp = (n: number) =>
    `~${liveOffers[0]?.salary_currency ?? "€"} ${Math.round(n).toLocaleString()}`;

  const kpis = (
    <div className="dash-kpis">
      <button type="button" className="dash-kpi click" onClick={onGoToJobs}>
        <span className="dash-kpi-n">{open.length}</span>
        <span className="dash-kpi-k">{t("dashboard.kpiOpen")}</span>
      </button>
      <button type="button" className="dash-kpi click" onClick={onGoToJobs}>
        <span className="dash-kpi-n">{Math.round(resp.rate * 100)}%</span>
        <span className="dash-kpi-k">
          {t("dashboard.kpiResponse", {
            responded: resp.responded,
            applied: resp.applied,
          })}
        </span>
      </button>
      <button
        type="button"
        className="dash-kpi click"
        onClick={() => liveOffers[0] && onOpenJob(liveOffers[0].id)}
      >
        <span className="dash-kpi-n">{liveOffers.length}</span>
        <span className="dash-kpi-k">
          {t("dashboard.kpiOffers")}
          {topComp != null ? ` · ${fmtComp(topComp)}` : ""}
        </span>
      </button>
      <div className="dash-kpi">
        <span className="dash-kpi-n">{t2o != null ? `~${Math.round(t2o)}d` : "—"}</span>
        <span className="dash-kpi-k">{t("dashboard.kpiToOffer")}</span>
      </div>
    </div>
  );

  const band = (
    <div className="dash-band">
      <div>
        <span className="dash-eyebrow">{t("dashboard.momentumTitle")}</span>
        <div className="dash-band-verdict">{t(`stats.momentum.${pipe.verdict}`)}</div>
        <div className="muted small">
          {t("stats.momentumDetail", { recent: pipe.recent, prior: pipe.prior })}
        </div>
      </div>
      <div className="dash-spark" aria-hidden="true">
        {mom.weeks.map((w, i) => (
          <i
            key={i}
            style={{ height: `${Math.max(4, (w.count / weekMax) * 100)}%` }}
            className={w.count === 0 ? "dim" : ""}
          />
        ))}
      </div>
    </div>
  );

  const funnelCard = (
    <button
      type="button"
      className="dash-card click"
      onClick={onGoToJobs}
      key="funnel"
    >
      <div className="dash-ch">
        {t("dashboard.funnelConv")}
        <span className="dash-win">{t("dashboard.winLiveAllTime")}</span>
      </div>
      <div className="dash-funnel">
        {FUNNEL_STAGES.map((st, i) => (
          <div className={`dash-fn stage-${st}`} key={st}>
            <span className="dash-fl">{t(`stages.${st}`)}</span>
            <span className="dash-fbar">
              <i style={{ width: `${(counts[i] / funnelMax) * 100}%` }} />
            </span>
            <span className="dash-fn-n">{counts[i]}</span>
          </div>
        ))}
      </div>
      <div className="muted small mono dash-conv-line">
        {conv.map((c) => `${Math.round(c.rate * 100)}%`).join(" · ")}{" "}
        {t("dashboard.stageToStage")}
      </div>
    </button>
  );

  const offersCard = (
    <div className="dash-card" key="offers">
      <div className="dash-ch">
        {t("dashboard.offers")}
        <span className="dash-win">{t("dashboard.winOpen")}</span>
      </div>
      {liveOffers.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {t("dashboard.noOffers")}
        </p>
      ) : (
        <ul className="dash-offers">
          {liveOffers.slice(0, 3).map((o) => {
            const tc = totalComp(o);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  className="dash-orow click"
                  onClick={() => onOpenJob(o.id)}
                >
                  <span className="dash-ot">{o.title}</span>
                  <span className="dash-ov">{tc != null ? fmtComp(tc) : "—"}</span>
                  <span className="dash-oc muted">
                    {o.company_name ?? "—"}
                    {o.salary_range ? ` · ${o.salary_range}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const fortnightCard = (
    <div className="dash-card" key="fortnight">
      <div className="dash-ch">
        {t("dashboard.thisFortnight")}
        <span className="dash-win">{t("dashboard.win2wk")}</span>
      </div>
      <div className="dash-stat">
        <span>{t("dashboard.response")}</span>
        <span className="sv">{Math.round(resp.rate * 100)}%</span>
      </div>
      <div className="dash-stat">
        <span>{t("dashboard.toOffer")}</span>
        <span className="sv">{t2o != null ? `~${Math.round(t2o)}d` : "—"}</span>
      </div>
      <div className="dash-stat">
        <span>{t("dashboard.momentumTitle")}</span>
        <span className="sv">{t(`stats.momentum.${pipe.verdict}`)}</span>
      </div>
    </div>
  );

  const analytics = [funnelCard, offersCard, fortnightCard];

  const activityCard = (
    <div className="dash-card" key="activity">
      <div className="dash-ch">{t("overview.recentlyUpdated")}</div>
      {recent.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {t("overview.noActivity")}
        </p>
      ) : (
        <ul className="side-list dash-recent">
          {recent.map((a) => (
            <li
              key={a.id}
              className={`stage-${a.status} clickable`}
              {...rowActivate(() => onOpenJob(a.id))}
            >
              <span className="side-date">{ageDays(a.updated_at)}</span>
              <span className="side-title">{a.title}</span>
              <span className="side-co">{a.company_name ?? "—"}</span>
              <span className="side-stage">{t(`stages.${a.status}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="dash">
      {kpis}
      {band}
      {hasActions ? (
        <div className="dash-cols">
          <div className="dash-col">
            <div className="dash-card dash-card-lead">
              <NextUpPanel
                notify={notify}
                applications={applications}
                onChanged={onChanged}
                onError={onError}
              />
            </div>
            {activityCard}
          </div>
          <div className="dash-col">{analytics}</div>
        </div>
      ) : (
        <>
          <div className="dash-caughtup">
            <span className="dash-caughtup-tick">✓</span>
            <span className="dash-caughtup-t">{t("dashboard.caughtUp")}</span>
            <span className="sp" />
            <button
              type="button"
              className="linklike"
              onClick={onOpenQuickAdd}
            >
              {t("dashboard.addFollowUp")}
            </button>
          </div>
          <div className="dash-cols">
            <div className="dash-col">{analytics}</div>
            <div className="dash-col">{activityCard}</div>
          </div>
        </>
      )}

      <button
        className="btn-secondary overview-activity-toggle"
        onClick={() => setShowActivity((v) => !v)}
        aria-expanded={showActivity}
      >
        {showActivity ? t("overview.hideActivity") : t("overview.showActivity")}
      </button>
      {showActivity && <ActivityTab onError={onError} onOpenJob={onOpenJob} />}

      <details className="dash-details">
        <summary>{t("dashboard.allNumbers")}</summary>
        <StatsTab stats={stats} fullApps={fullApps} />
      </details>
    </section>
  );
}

function NextUpPanel({
  applications,
  onChanged,
  onError,
  notify,
}: {
  applications: Application[];
  onChanged: () => Promise<unknown> | void;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void, label?: string) => void;
}) {
  const { t } = useTranslation();
  const upcoming = applications
    .filter((a) => a.next_action_at && !isDead(a.status))
    .sort((a, b) => {
      const byDate = (a.next_action_at ?? "").localeCompare(
        b.next_action_at ?? "",
      );
      if (byDate !== 0) return byDate;
      return (b.fit_score ?? 0) - (a.fit_score ?? 0);
    })
    .slice(0, 6);

  // Inline follow-up actions (#285) — complete or push a reminder without
  // opening the edit form, so the app's core loop is actionable where it's
  // shown rather than read-only.
  const done = (a: Application) => {
    const prevFu = {
      next_action: a.next_action ?? null,
      next_action_at: a.next_action_at ?? null,
    };
    return Promise.resolve(
      api.updateFollowUp(a.id, { next_action: null, next_action_at: null }),
    )
      .then(() => onChanged())
      .then(() =>
        notify(t("nextUp.doneToast"), () =>
          api
            .updateFollowUp(a.id, prevFu)
            .then(() => onChanged())
            .catch((e) => onError((e as Error).message)),
        ),
      )
      .catch((e) => onError((e as Error).message));
  };
  const snooze = (a: Application) => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return Promise.resolve(
      api.updateFollowUp(a.id, {
        next_action: a.next_action ?? null,
        next_action_at: d.toISOString().slice(0, 10),
      }),
    )
      .then(() => onChanged())
      .catch((e) => onError((e as Error).message));
  };

  return (
    <aside className="jobs-side">
      <h3 className="side-h">{t("nextUp.title")}</h3>
      {upcoming.length === 0 ? (
        <p className="muted small">{t("empty.noFollowUps")}</p>
      ) : (
        <ul className="side-list">
          {upcoming.map((a) => (
            <li key={a.id} className={`stage-${a.status}`}>
              <span
                className={`side-date${isOverdue(a) ? " late" : isDue(a) ? " today" : ""}`}
              >
                {formatDate(a.next_action_at!)}
              </span>
              <span className="side-title">
                {a.title}
                {a.fit_score ? (
                  <span className="fit-stars"> {"★".repeat(a.fit_score)}</span>
                ) : null}
              </span>
              <span className="side-co">{a.company_name ?? "—"}</span>
              <span className="side-stage">{t(`stages.${a.status}`)}</span>
              <span className="nextup-actions">
                <button onClick={() => done(a)}>{t("nextUp.done")}</button>
                <button onClick={() => snooze(a)}>{t("nextUp.snooze")}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

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
function ApplicationForm({
  initial,
  companies,
  contacts,
  roleTypes,
  applications,
  onSubmit,
  onCancel,
  onError,
}: {
  initial: Application | null;
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  applications?: Application[];
  onSubmit: (data: Partial<Application>) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Application>>(
    initial ?? { role_type: "other", status: "interested" },
  );
  const [extraCompanies, setExtraCompanies] = useState<Company[]>([]);
  const [importing, setImporting] = useState(false);
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<Application>) =>
    setForm((f) => ({ ...f, ...patch }));

  const allCompanies = [...companies, ...extraCompanies];

  // Same company + not already dismissed/rejected/withdrawn — a soft,
  // dismissable nudge rather than a hard block, since deliberately
  // re-applying (different role, referral this time, reopened req) is
  // a real workflow (#217).
  const possibleDuplicate =
    !initial && form.company_id
      ? (applications ?? []).find(
          (a) => a.company_id === form.company_id && !isDead(a.status),
        )
      : null;

  // Fetch the job page and pre-fill; creates the company if unknown
  const importFromUrl = async () => {
    if (!form.url) return;
    setImporting(true);
    try {
      const r = await api.importUrl(form.url);
      const patch: Partial<Application> = {};
      if (r.title && !form.title) patch.title = r.title;
      if (r.salary && !form.salary_range) patch.salary_range = r.salary;
      if (r.source && !form.source) patch.source = r.source;
      if (r.company) {
        const existing = allCompanies.find(
          (c) => c.name.toLowerCase() === r.company!.toLowerCase(),
        );
        if (existing) {
          patch.company_id = existing.id;
        } else {
          const created = await api.create<Company>("companies", {
            name: r.company,
            location: r.location,
          });
          setExtraCompanies((x) => [...x, created]);
          patch.company_id = created.id;
        }
      }
      set(patch);
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      {possibleDuplicate && (
        <p className="error">
          <ErrorIcon />
          <span className="error-text">
            {t("detail.possibleDuplicate", { title: possibleDuplicate.title })}
          </span>
        </p>
      )}
      <div className="form-group">
        <h4>{t("forms.basics")}</h4>
        <label>
          {t("forms.title")} *
          <input
            required
            value={form.title ?? ""}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label>
          {t("forms.roleType")}
          <select
            value={form.role_type ?? "other"}
            onChange={(e) =>
              set({ role_type: e.target.value as Application["role_type"] })
            }
          >
            {roleTypes.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("forms.company")}
          <select
            value={form.company_id ?? ""}
            onChange={(e) =>
              set({
                company_id: e.target.value ? Number(e.target.value) : null,
              })
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
        <label>
          {t("forms.contact")}
          <select
            value={form.contact_id ?? ""}
            onChange={(e) =>
              set({
                contact_id: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("referral.referredBy")}
          <select
            value={form.referred_by_contact_id ?? ""}
            onChange={(e) =>
              set({
                referred_by_contact_id: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
          >
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-group">
        <h4>{t("forms.postingCompensation")}</h4>
        <label>
          {t("forms.url")}
          <span className="url-row">
            <input
              type="url"
              value={form.url ?? ""}
              onChange={(e) => set({ url: e.target.value || null })}
            />
            <button
              type="button"
              disabled={!form.url || importing}
              onClick={importFromUrl}
            >
              {importing ? t("common.fetching") : t("common.fetch")}
            </button>
          </span>
        </label>
        <label>
          {t("forms.source")}
          <input
            placeholder={t("forms.sourcePlaceholder")}
            value={form.source ?? ""}
            onChange={(e) => set({ source: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.salaryRange")}
          <input
            placeholder={t("forms.salaryRangePlaceholder")}
            value={form.salary_range ?? ""}
            onChange={(e) => set({ salary_range: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.currency")}
          <select
            value={form.salary_currency ?? ""}
            onChange={(e) => set({ salary_currency: e.target.value || null })}
          >
            <option value="">—</option>
            {["EUR", "USD", "GBP"].map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("forms.min")}
          <input
            type="number"
            min={0}
            value={form.salary_min ?? ""}
            onChange={(e) =>
              set({
                salary_min: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label>
          {t("forms.max")}
          <input
            type="number"
            min={0}
            value={form.salary_max ?? ""}
            onChange={(e) =>
              set({
                salary_max: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label>
          {t("forms.per")}
          <select
            value={form.salary_period ?? ""}
            onChange={(e) =>
              set({
                salary_period: (e.target.value || null) as
                  | "year"
                  | "month"
                  | null,
              })
            }
          >
            <option value="">—</option>
            <option value="year">{t("forms.year")}</option>
            <option value="month">{t("forms.month")}</option>
          </select>
        </label>
        <label>
          {t("forms.appliedOn")}
          <input
            type="date"
            value={form.applied_at ?? ""}
            onChange={(e) => set({ applied_at: e.target.value || null })}
          />
        </label>
      </div>

      {form.status === "offer" && (
        <div className="form-group">
          <h4>{t("offer.title")}</h4>
          <label>
            {t("offer.signingBonus")}
            <input
              type="number"
              min={0}
              value={form.signing_bonus ?? ""}
              onChange={(e) =>
                set({
                  signing_bonus: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
          <label>
            {t("offer.bonusTarget")}
            <input
              type="number"
              min={0}
              max={100}
              value={form.bonus_target_pct ?? ""}
              onChange={(e) =>
                set({
                  bonus_target_pct: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <label>
            {t("offer.equityValue")}
            <input
              type="number"
              min={0}
              value={form.equity_value ?? ""}
              onChange={(e) =>
                set({
                  equity_value: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
          <label className="full">
            {t("offer.benefitsNotes")}
            <textarea
              rows={2}
              value={form.benefits_notes ?? ""}
              onChange={(e) =>
                set({ benefits_notes: e.target.value || null })
              }
            />
          </label>
        </div>
      )}

      <div className="form-group">
        <h4>{t("forms.followUp")}</h4>
        <label>
          {t("forms.nextAction")}
          <input
            placeholder={t("forms.nextActionPlaceholder")}
            value={form.next_action ?? ""}
            onChange={(e) => set({ next_action: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.nextActionDue")}
          <input
            type="date"
            value={form.next_action_at ?? ""}
            onChange={(e) => set({ next_action_at: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.deadline")}
          <input
            type="date"
            value={form.deadline_at ?? ""}
            onChange={(e) => set({ deadline_at: e.target.value || null })}
          />
        </label>
        <label>
          {t("forms.fitScore")}
          <select
            value={form.fit_score ?? ""}
            onChange={(e) =>
              set({
                fit_score: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          {t("forms.notes")}
          <textarea
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value || null })}
          />
        </label>
        <label className="full">
          {t("detail.jobDescription")}
          {form.job_description_captured_at && (
            <span className="muted small">
              {" "}
              — {t("detail.jobDescriptionCaptured", {
                date: formatDate(form.job_description_captured_at),
              })}
            </span>
          )}
          <textarea
            rows={6}
            placeholder={t("detail.jobDescriptionPlaceholder")}
            value={form.job_description ?? ""}
            onChange={(e) => set({ job_description: e.target.value || null })}
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
