import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { authClient, signOut, useSession } from "./auth-client";
import {
  INTERACTION_TYPES,
  type Stats,
  STATUSES,
  type Application,
  type Company,
  type Contact,
  type Document,
  type AgendaEntry,
  type ActivityEvent,
  type FeedItem,
  type RoleTypeDef,
  type Interaction,
  type Status,
  type Profile,
  type WorkExperience,
  type Education,
  type Language,
  type Skill,
  type StatusHistoryRow,
  type OutreachStatus,
  type PrepItem,
} from "./types";
import "./App.css";

// Shared remove-icon glyph (#118) — a plain "×" character renders at
// inconsistent visual weight across browsers/fonts; an inline SVG at a
// fixed stroke width looks the same everywhere.
// Loading skeleton (#122) — replaces the plain "Loading…" text with
// shimmering placeholder bars shaped like the app's own .card rows.
function LoadingSkeleton() {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton-card" />
      ))}
    </div>
  );
}

// Empty-state illustrations (#136) — extending Jobs' hand-drawn SVG
// (the climbing-dots motif above) to the other tabs, in the same
// line-art style: currentColor strokes, one accent-stroked highlight.
function EmptyBoardIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="14" y="20" width="20" height="56" rx="4" strokeWidth="4" opacity="0.28" />
      <rect x="38" y="34" width="20" height="42" rx="4" strokeWidth="4" opacity="0.5" />
      <rect x="62" y="14" width="20" height="62" rx="4" strokeWidth="5" className="accent-stroke" />
    </svg>
  );
}

function EmptyCompaniesIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="18" y="24" width="60" height="52" rx="4" strokeWidth="4" opacity="0.3" />
      <line x1="32" y1="38" x2="40" y2="38" strokeWidth="4" strokeLinecap="round" />
      <line x1="56" y1="38" x2="64" y2="38" strokeWidth="4" strokeLinecap="round" />
      <line x1="32" y1="54" x2="40" y2="54" strokeWidth="4" strokeLinecap="round" />
      <line x1="56" y1="54" x2="64" y2="54" strokeWidth="4" strokeLinecap="round" className="accent-stroke" />
      <line x1="42" y1="76" x2="54" y2="76" strokeWidth="5" opacity="0.5" />
    </svg>
  );
}

function EmptyPeopleIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="36" cy="34" r="14" strokeWidth="4" opacity="0.35" />
      <path d="M14 78c2-16 14-24 22-24s20 8 22 24" strokeWidth="4" opacity="0.35" strokeLinecap="round" />
      <circle cx="66" cy="30" r="12" strokeWidth="5" className="accent-stroke" />
      <path d="M48 78c2-14 12-21 18-21s16 7 18 21" strokeWidth="5" className="accent-stroke" strokeLinecap="round" />
    </svg>
  );
}

function EmptyCvIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="24" y="12" width="48" height="72" rx="4" strokeWidth="4" opacity="0.3" />
      <line x1="34" y1="28" x2="62" y2="28" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
      <line x1="34" y1="40" x2="62" y2="40" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
      <line x1="34" y1="52" x2="52" y2="52" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
      <line x1="34" y1="66" x2="62" y2="66" strokeWidth="5" className="accent-stroke" strokeLinecap="round" />
      <line x1="34" y1="76" x2="50" y2="76" strokeWidth="5" className="accent-stroke" strokeLinecap="round" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg
      className="remove-icon"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 1L9 9M9 1L1 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Tab =
  | "overview"
  | "applications"
  | "board"
  | "feed"
  | "calendar"
  | "activity"
  | "stats"
  | "companies"
  | "contacts"
  | "cv";

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
  activity: "/activity",
  stats: "/stats",
  companies: "/companies",
  contacts: "/people",
  cv: "/cv",
};

const PATH_TABS: Record<string, Tab> = {
  jobs: "applications",
  board: "board",
  feed: "feed",
  calendar: "calendar",
  activity: "activity",
  stats: "stats",
  companies: "companies",
  people: "contacts",
  cv: "cv",
};

function parsePath(pathname: string): { tab: Tab; id: number | null } {
  const match = pathname.match(/^\/([a-z]+)(?:\/(\d+))?\/?$/);
  const tab = (match && PATH_TABS[match[1]]) || "overview";
  const id = match && match[2] ? Number(match[2]) : null;
  return { tab, id };
}

const PIPELINE: Status[] = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
];

const OUTREACH_STATUSES: OutreachStatus[] = [
  "not_contacted",
  "awaiting_reply",
  "replied",
  "no_response",
];

function isDead(status: Status): boolean {
  return status === "rejected" || status === "withdrawn" || status === "ghosted";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDue(a: Application): boolean {
  return !!a.next_action_at && !isDead(a.status) && a.next_action_at <= today();
}

function isOverdue(a: Application): boolean {
  return !!a.next_action_at && !isDead(a.status) && a.next_action_at < today();
}

function isFollowUpDue(c: Contact): boolean {
  return !!c.follow_up_at && c.follow_up_at <= today();
}

function isFollowUpOverdue(c: Contact): boolean {
  return !!c.follow_up_at && c.follow_up_at < today();
}

const DEADLINE_SOON_DAYS = 3;

function deadlineDaysLeft(a: Application): number | null {
  if (!a.deadline_at) return null;
  return Math.round(
    (new Date(a.deadline_at).getTime() - new Date(today()).getTime()) /
      86400000,
  );
}

function isDeadlineSoon(a: Application): boolean {
  const days = deadlineDaysLeft(a);
  return days !== null && !isDead(a.status) && days <= DEADLINE_SOON_DAYS;
}

function isDeadlinePast(a: Application): boolean {
  const days = deadlineDaysLeft(a);
  return days !== null && !isDead(a.status) && days < 0;
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

// Only http(s) links are ever rendered as href — a stored javascript:
// or data: URI (from a feed source, a scraped import, or hand-typed)
// must not be clickable.
function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

function ageDays(updatedAt: string): string {
  const then = new Date(updatedAt.replace(" ", "T") + "Z").getTime();
  const days = Math.max(0, Math.floor((Date.now() - then) / 86400000));
  return `${days}d`;
}

function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={(size * 140) / 56}
      height={size}
      viewBox="0 0 140 56"
      fill="none"
      aria-hidden="true"
    >
      <line x1="14" y1="28" x2="98" y2="28" stroke="currentColor" strokeWidth="4" opacity="0.3" />
      <circle cx="14" cy="28" r="5.5" fill="currentColor" />
      <circle cx="38" cy="28" r="5.5" fill="currentColor" />
      <circle cx="62" cy="28" r="5.5" fill="currentColor" opacity="0.45" />
      <g stroke="var(--accent)" strokeWidth="3.6">
        <circle cx="106" cy="28" r="12" />
        <line x1="106" y1="10" x2="106" y2="16" />
        <line x1="106" y1="40" x2="106" y2="46" />
        <line x1="88" y1="28" x2="94" y2="28" />
        <line x1="118" y1="28" x2="124" y2="28" />
      </g>
      <circle cx="106" cy="28" r="4" fill="var(--accent)" />
    </svg>
  );
}

const SHORTCUT_KEYS: [string, string][] = [
  ["/", "focusSearch"],
  ["n", "addJob"],
  ["j / k", "moveFocus"],
  ["1–8", "setStatus"],
  ["Esc", "closeHelp"],
  ["?", "toggleHelp"],
];

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal shortcut-help"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t("shortcuts.title")}
      >
        <h2>{t("shortcuts.title")}</h2>
        <p className="muted small">{t("shortcuts.subtitle")}</p>
        <ul>
          {SHORTCUT_KEYS.map(([key, labelKey]) => (
            <li key={key}>
              <kbd>{key}</kbd>
              <span>{t(`shortcuts.${labelKey}`)}</span>
            </li>
          ))}
        </ul>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>
    </div>
  );
}

const LANGUAGES: [string, string][] = [
  ["en", "languageEn"],
  ["nl", "languageNl"],
];

const UNKNOWN_SOURCE = "__unknown_source__";

const CV_LANG_KEY = "jobseekr_cv_lang";

function getCvLanguage(fallback: string): string {
  return localStorage.getItem(CV_LANG_KEY) || fallback;
}

function OnboardingChecklist({
  profileDone,
  companyDone,
  onGoToProfile,
  onGoToCompanies,
  onDismiss,
}: {
  profileDone: boolean;
  companyDone: boolean;
  onGoToProfile: () => void;
  onGoToCompanies: () => void;
  onDismiss: () => void;
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
        <li>
          <span>{t("onboarding.firstJob")}</span>
        </li>
      </ul>
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
}: {
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  onClose: () => void;
  onJumpToApplication: (id: number) => void;
  onJumpToCompany: (name: string) => void;
  onJumpToContact: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const matchedApps = q
    ? applications.filter((a) => a.title.toLowerCase().includes(q)).slice(0, 6)
    : [];
  const matchedCompanies = q
    ? companies.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
    : [];
  const matchedContacts = q
    ? contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
    : [];
  const empty =
    q && !matchedApps.length && !matchedCompanies.length && !matchedContacts.length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal command-palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t("palette.title")}
      >
        <input
          ref={inputRef}
          type="search"
          className="palette-input"
          placeholder={t("palette.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {q && (
          <div className="palette-results">
            {matchedApps.length > 0 && (
              <div className="palette-group">
                <span className="palette-group-label">{t("tabs.jobs")}</span>
                {matchedApps.map((a) => (
                  <button
                    key={a.id}
                    className="palette-item"
                    onClick={() => onJumpToApplication(a.id)}
                  >
                    {a.title}
                    {a.company_name ? (
                      <span className="muted small"> — {a.company_name}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
            {matchedCompanies.length > 0 && (
              <div className="palette-group">
                <span className="palette-group-label">{t("tabs.companies")}</span>
                {matchedCompanies.map((c) => (
                  <button
                    key={c.id}
                    className="palette-item"
                    onClick={() => onJumpToCompany(c.name)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {matchedContacts.length > 0 && (
              <div className="palette-group">
                <span className="palette-group-label">{t("tabs.people")}</span>
                {matchedContacts.map((c) => (
                  <button
                    key={c.id}
                    className="palette-item"
                    onClick={() => onJumpToContact(c.name)}
                  >
                    {c.name}
                    {c.company_name ? (
                      <span className="muted small"> — {c.company_name}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
            {empty && <p className="muted small">{t("palette.noResults")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminInvite() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const { error } = await authClient.admin.createUser({
      email,
      name,
      password,
      role,
    });
    setBusy(false);
    if (error) {
      setResult({ ok: false, message: t("account.inviteError") });
      return;
    }
    setResult({ ok: true, message: t("account.inviteSuccess", { email }) });
    setEmail("");
    setName("");
    setPassword("");
    setRole("user");
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.adminInvite")}</h3>
      <form onSubmit={submit}>
        <label className="settings-field">
          <span>{t("account.inviteName")}</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="settings-field">
          <span>{t("account.inviteEmail")}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="settings-field">
          <span>{t("account.invitePassword")}</span>
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="settings-field">
          <span>{t("account.inviteRole")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
            <option value="user">{t("account.inviteRoleUser")}</option>
            <option value="admin">{t("account.inviteRoleAdmin")}</option>
          </select>
        </label>
        {result && (
          <p className={result.ok ? "admin-invite-success" : "login-error"}>
            {result.message}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {t("account.inviteSubmit")}
        </button>
      </form>
      <ResetDemoData />
    </div>
  );
}

function ResetDemoData() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reset = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/reset-demo-data", { method: "POST" });
    setBusy(false);
    setMessage(
      res.ok ? t("account.resetDemoSuccess") : t("account.resetDemoError"),
    );
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.resetDemo")}</h3>
      {message && <p className="admin-invite-success">{message}</p>}
      <button disabled={busy} onClick={reset}>
        {t("account.resetDemoSubmit")}
      </button>
    </div>
  );
}

const THEME_KEY = "jobseekr_theme";

// Applies the persisted theme choice — called on initial load (see App())
// and whenever the Settings selector changes it.
function applyTheme(value: string) {
  if (value === "control-room") {
    document.documentElement.dataset.theme = "control-room";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { data: session } = useSession();
  const [cvLang, setCvLang] = useState(() =>
    getCvLanguage(i18n.resolvedLanguage ?? "en"),
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) ?? "auto",
  );
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    api.profile().then((p) => setShareToken(p.share_token));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shareUrl = shareToken
    ? `${window.location.origin}/shared/${shareToken}`
    : null;

  const generateLink = () => {
    setShareBusy(true);
    api
      .generateShareToken()
      .then((r) => setShareToken(r.share_token))
      .finally(() => setShareBusy(false));
  };

  const disableLink = () => {
    setShareBusy(true);
    api
      .revokeShareToken()
      .then(() => setShareToken(null))
      .finally(() => setShareBusy(false));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal settings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t("settings.title")}
      >
        <h2>{t("settings.title")}</h2>
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
            <option value="control-room">{t("settings.themeControlRoom")}</option>
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
        <div className="account-section">
          {session && (
            <div className="account-signed-in">
              <span>{t("account.signedInAs", { email: session.user.email })}</span>
              <button onClick={() => signOut()}>{t("account.signOut")}</button>
            </div>
          )}
          {session?.user.role === "admin" && <AdminInvite />}
        </div>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>
    </div>
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
// Momentum streak tracker (#145) — three states: active streak, a
// dismissible one-time milestone banner every 4 weeks, and a broken
// streak. The broken state is deliberately non-punitive: a job search
// has genuine weeks off, and guilt-tripping a quiet week works against
// a tool meant to reduce search-related stress.
const STREAK_MILESTONE_INTERVAL = 4;

function MomentumStreak({
  streak,
  broken,
}: {
  streak: number;
  broken: boolean;
}) {
  const { t } = useTranslation();
  const isMilestone = streak > 0 && streak % STREAK_MILESTONE_INTERVAL === 0;
  const [dismissedMilestone, setDismissedMilestone] = useState(() =>
    Number(localStorage.getItem("jobseekr_streak_milestone_dismissed") ?? 0),
  );
  const dismissMilestone = () => {
    localStorage.setItem("jobseekr_streak_milestone_dismissed", String(streak));
    setDismissedMilestone(streak);
  };

  if (broken) {
    return (
      <div className="streak streak-broken">
        <span className="streak-label">{t("stats.streak.brokenTitle")}</span>
        <p className="muted small">{t("stats.streak.brokenBody")}</p>
      </div>
    );
  }

  if (streak === 0) return null;

  if (isMilestone && streak > dismissedMilestone) {
    return (
      <div className="streak streak-milestone">
        <span className="streak-label">
          {t("stats.streak.milestoneTitle", { count: streak })}
        </span>
        <button className="modal-close" onClick={dismissMilestone} aria-label={t("common.close")}>
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="streak streak-active">
      <span className="streak-label">{t("stats.streak.activeTitle", { count: streak })}</span>
    </div>
  );
}

function StageHistogram({ applications }: { applications: Application[] }) {
  const { t } = useTranslation();
  const open = applications.filter((a) => !isDead(a.status));
  const total = open.length;
  const counts = PIPELINE.map(
    (s) => open.filter((a) => a.status === s).length,
  );

  const size = 96;
  const strokeWidth = 14;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div className="ring-chart">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t("stats.pipelineFunnel")}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--track)"
          strokeWidth={strokeWidth}
        />
        {total > 0 &&
          PIPELINE.map((s, i) => {
            const count = counts[i];
            if (count === 0) return null;
            const fraction = count / total;
            const dash = fraction * circumference;
            const offset = -cumulative * circumference;
            cumulative += fraction;
            return (
              <circle
                key={s}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={`var(--st-${s})`}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="ring-total"
        >
          {total}
        </text>
      </svg>
      <ul className="ring-legend">
        {PIPELINE.map((s, i) => (
          <li key={s} className={`stage-${s}`}>
            <span className="ring-dot" aria-hidden="true" />
            <span className="lbl">{t(`stages.${s}`)}</span>
            <span className="n">{counts[i]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { tab, id: detailIdFromUrl } = parsePath(location.pathname);
  const setTab = (next: Tab) => navigate(TAB_PATHS[next]);
  const [showSettings, setShowSettings] = useState(false);
  // Mobile quick-add FAB (#135) — reachable from any tab, not just from
  // inside the Jobs toolbar. A counter rather than a boolean so repeated
  // taps re-trigger the effect in ApplicationsTab even if the form was
  // already open and got closed again.
  const [quickAddSignal, setQuickAddSignal] = useState(0);
  const [applications, setApplications] = useState<Application[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleTypeDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [apps, comps, conts, roles] = await Promise.all([
        api.list<Application>("applications"),
        api.list<Company>("companies"),
        api.list<Contact>("contacts"),
        api.roleTypes(),
      ]);
      setApplications(apps);
      setCompanies(comps);
      setContacts(conts);
      setRoleTypes(roles);
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

  const notify = useCallback((message: string, undo?: () => void) => {
    const id = Date.now();
    setToast({ id, message, undo });
    window.setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
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
      notify(`Deleted "${name}"`, () => {
        window.clearTimeout(timer);
        setHidden((h) => {
          const next = new Set(h);
          next.delete(key);
          return next;
        });
      });
    },
    [notify, reload],
  );

  // Optimistic status change: update locally, revert on API failure
  const setStatus = useCallback(
    (id: number, status: Status) => {
      const prev = applications;
      setApplications((apps) =>
        apps.map((a) => (a.id === id ? { ...a, status } : a)),
      );
      api
        .setStatus(id, status)
        .then(reload)
        .catch((e) => {
          setApplications(prev);
          setError((e as Error).message);
        });
    },
    [applications, reload],
  );

  const visibleApps = applications.filter(
    (a) => !hidden.has(`applications:${a.id}`),
  );
  // Archived applications keep contributing to Stats history but are
  // hidden from the active pipeline views (header count, Board, Next up).
  const activeApps = visibleApps.filter((a) => !a.archived_at);
  const visibleCompanies = companies.filter(
    (c) => !hidden.has(`companies:${c.id}`),
  );
  const visibleContacts = contacts.filter(
    (c) => !hidden.has(`contacts:${c.id}`),
  );

  return (
    <div className="app">
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
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
          onJumpToCompany={(name) => {
            setJumpQuery(name);
            setTab("companies");
            setShowPalette(false);
          }}
          onJumpToContact={(name) => {
            setJumpQuery(name);
            setTab("contacts");
            setShowPalette(false);
          }}
        />
      )}
      <header className={`header${scrolled ? " scrolled" : ""}`}>
        <div className="brand">
          <Logo />
          <h1>JobSeekr</h1>
        </div>
        <span className="header-actions">
          <span className="open-count">
            {t("header.openCount", {
              count: activeApps.filter((a) => !isDead(a.status)).length,
            })}
            {activeApps.filter(isDue).length > 0 &&
              ` · ${t("header.dueCount", { count: activeApps.filter(isDue).length })}`}
          </span>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(true)}
            title={t("header.settings")}
            aria-label={t("header.settings")}
          >
            ⚙
          </button>
        </span>
      </header>
      <nav className="tabs">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          {t("tabs.overview")}
        </button>
        <button
          className={tab === "applications" ? "active" : ""}
          onClick={() => setTab("applications")}
        >
          {t("tabs.jobs")}
        </button>
        <button
          className={tab === "board" ? "active" : ""}
          onClick={() => setTab("board")}
        >
          {t("tabs.board")}
        </button>
        <button
          className={tab === "feed" ? "active" : ""}
          onClick={() => setTab("feed")}
        >
          {t("tabs.feed")}
        </button>
        <button
          className={tab === "calendar" ? "active" : ""}
          onClick={() => setTab("calendar")}
        >
          {t("tabs.calendar")}
        </button>
        <button
          className={tab === "activity" ? "active" : ""}
          onClick={() => setTab("activity")}
        >
          {t("tabs.activity")}
        </button>
        <button
          className={tab === "stats" ? "active" : ""}
          onClick={() => setTab("stats")}
        >
          {t("tabs.stats")}
        </button>
        <button
          className={tab === "companies" ? "active" : ""}
          onClick={() => setTab("companies")}
        >
          {t("tabs.companies")}
        </button>
        <button
          className={tab === "contacts" ? "active" : ""}
          onClick={() => setTab("contacts")}
        >
          {t("tabs.people")}
        </button>
        <button
          className={tab === "cv" ? "active" : ""}
          onClick={() => setTab("cv")}
        >
          {t("tabs.cv")}
        </button>
      </nav>

      {error && <p className="error">{error}</p>}

      <main className="content">
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {tab === "overview" &&
              applications.length === 0 &&
              !onboardingDismissed && (
                <OnboardingChecklist
                  profileDone={
                    !!(onboardingProfile?.name && onboardingProfile?.email)
                  }
                  companyDone={companies.length > 0}
                  onGoToProfile={() => setTab("cv")}
                  onGoToCompanies={() => setTab("companies")}
                  onDismiss={dismissOnboarding}
                />
              )}
            {tab === "overview" && (
              <OverviewTab
                applications={visibleApps}
                onGoToJobs={() => setTab("applications")}
                onOpenJob={(id) => navigate(`/jobs/${id}`)}
              />
            )}
            {tab === "applications" && (
              <ApplicationsTab
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
                initialDetailId={detailIdFromUrl}
                onDetailIdChange={(id) =>
                  navigate(id ? `/jobs/${id}` : "/jobs")
                }
                quickAddSignal={quickAddSignal}
              />
            )}
            {tab === "board" && (
              <BoardTab
                applications={activeApps}
                companies={visibleCompanies}
                contacts={visibleContacts}
                roleTypes={roleTypes}
                onChanged={reload}
                onError={setError}
                notify={notify}
                onDelete={deleteWithUndo}
                onStatus={setStatus}
                initialDetailId={detailIdFromUrl}
                onDetailIdChange={(id) =>
                  navigate(id ? `/board/${id}` : "/board")
                }
              />
            )}
            {tab === "feed" && (
              <FeedTab
                onError={setError}
                notify={notify}
                roleTypes={roleTypes}
                onRoleTypesChanged={reload}
              />
            )}
            {tab === "calendar" && (
              <CalendarTab
                onError={setError}
                onJump={(title) => {
                  setJumpQuery(title);
                  setTab("applications");
                }}
              />
            )}
            {tab === "activity" && (
              <ActivityTab
                onError={setError}
                onOpenJob={(id) => navigate(`/jobs/${id}`)}
              />
            )}
            {tab === "stats" && <StatsTab onError={setError} />}
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
              />
            )}
            {tab === "cv" && <CVTab onError={setError} notify={notify} />}
          </>
        )}
      </main>

      <button
        className="quick-add-fab"
        onClick={() => {
          setTab("applications");
          setQuickAddSignal((n) => n + 1);
        }}
        aria-label={t("toolbar.addJob")}
      >
        +
      </button>

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface TabProps {
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}

interface CrudTabProps extends TabProps {
  notify: (message: string, undo?: () => void) => void;
  onDelete: (resource: string, id: number, name: string) => void;
}

// Shared card markup for both Board layouts (stage columns and the
// company-swimlanes mode from #130) — extracted so drag-and-drop, the
// referral/stale badges, and the stage <select> aren't duplicated.
function BoardCard({
  a,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpenDetail,
  onMove,
}: {
  a: Application;
  draggable: boolean;
  isDragging: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onOpenDetail: () => void;
  onMove: (status: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <article
      className={`bcard stage-${a.status}${isDragging ? " dragging" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <div className="bcard-body" onClick={onOpenDetail}>
        <strong>
          {a.title}
          {a.referred_by_contact_id ? (
            <span className="badge" title={t("referral.referredBy")}>
              {" "}
              {t("referral.badge")}
            </span>
          ) : null}
          {a.posting_status === "maybe_stale" ? (
            <span className="badge warn" title={t("posting.staleHint")}>
              {" "}
              {t("posting.staleBadge")}
            </span>
          ) : null}
        </strong>
        <span className="co">
          {a.company_name ?? "—"}
          {a.contact_name ? ` · ${a.contact_name}` : ""}
        </span>
        <span className="bmeta">
          {isDue(a) && a.next_action ? (
            <span className={isOverdue(a) ? "late" : "today"}>
              → {a.next_action}
            </span>
          ) : (
            `upd ${ageDays(a.updated_at)}`
          )}
        </span>
      </div>
      <select
        className={`status stage-${a.status}`}
        value={a.status}
        onChange={(e) => onMove(e.target.value)}
        aria-label={`Move ${a.title} to stage`}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`stages.${s}`)}
          </option>
        ))}
      </select>
    </article>
  );
}

function BoardTab({
  applications,
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
  initialDetailId?: number | null;
  onDetailIdChange?: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const move = (a: Application, status: string) =>
    onStatus(a.id, status as Status);

  const open = applications.filter((a) => !isDead(a.status));

  // Collapsed by default, except stages with something due — keeps a
  // long mobile scroll from burying the stage that actually needs
  // attention under every earlier one. A manual toggle wins once used.
  // Desktop's columns sit side by side and never needed this, so it
  // renders plain always-visible sections there instead — no <details>,
  // no toggle affordance at all (see #47).
  const [manualOpen, setManualOpen] = useState<Partial<Record<Status, boolean>>>(
    {},
  );
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 900px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  // Drag-and-drop is explicitly gated off on touch input (#54) — native
  // HTML5 DnD doesn't cleanly support touch, and some browsers partially
  // honor draggable via long-press, producing a half-working gesture that
  // interferes with scroll. The status <select> stays the only way to
  // move a card on touch, as documented in #41.
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

  // Alternate grouping (#130) — rows are companies, columns stay the
  // pipeline stages, useful once several applications pile up at the
  // same company. Swimlane mode has no drag-and-drop (the stage
  // <select> is the only way to move a card there) to keep this
  // additive rather than doubling the DnD surface to maintain.
  const [groupBy, setGroupBy] = useState<"stage" | "company">("stage");
  const lanes = new Map<number | null, Application[]>();
  for (const a of open) {
    const key = a.company_id;
    (lanes.get(key) ?? lanes.set(key, []).get(key)!).push(a);
  }
  const laneEntries = [...lanes.entries()].sort((a, b) => {
    const nameA = companies.find((c) => c.id === a[0])?.name ?? "";
    const nameB = companies.find((c) => c.id === b[0])?.name ?? "";
    return nameA.localeCompare(nameB);
  });

  return (
    <>
    <div className="board-toolbar">
      <div className="board-group-toggle" role="group" aria-label={t("board.groupBy")}>
        <button
          className={groupBy === "stage" ? "active" : ""}
          onClick={() => setGroupBy("stage")}
        >
          {t("board.byStage")}
        </button>
        <button
          className={groupBy === "company" ? "active" : ""}
          onClick={() => setGroupBy("company")}
        >
          {t("board.byCompany")}
        </button>
      </div>
    </div>
    {groupBy === "company" ? (
      <div className="board-swimlanes">
        {laneEntries.map(([companyId, apps]) => (
          <div className="lane" key={companyId ?? "none"}>
            <div className="lane-label">
              <span>
                {companies.find((c) => c.id === companyId)?.name ??
                  t("board.noCompany")}
              </span>
              <span className="n">{apps.length}</span>
            </div>
            <div className="lane-stages">
              {PIPELINE.map((stage) => (
                <div className="lane-cell" key={stage}>
                  {apps
                    .filter((a) => a.status === stage)
                    .map((a) => (
                      <BoardCard
                        key={a.id}
                        a={a}
                        draggable={false}
                        isDragging={false}
                        onOpenDetail={() => setDetailId(a.id)}
                        onMove={(status) => move(a, status)}
                      />
                    ))}
                </div>
              ))}
            </div>
          </div>
        ))}
        {laneEntries.length === 0 && (
          <p className="empty">
            <EmptyBoardIcon />
            {t("empty.boardEmpty")}
          </p>
        )}
      </div>
    ) : (
    <div className="board">
      {PIPELINE.map((stage) => {
        const cards = open.filter((a) => a.status === stage);
        const hasDue = cards.some(isDue);
        const isOpen = manualOpen[stage] ?? hasDue;
        const className = `bcol stage-${stage}${dragOverStage === stage ? " drag-over" : ""}`;
        const handleDragOver = (e: React.DragEvent) => {
          if (draggingId === null) return;
          e.preventDefault();
          setDragOverStage(stage);
          if (!isOpen) setManualOpen((m) => ({ ...m, [stage]: true }));
        };
        const handleDragLeave = () =>
          setDragOverStage((s) => (s === stage ? null : s));
        const handleDrop = (e: React.DragEvent) => {
          e.preventDefault();
          const id = Number(e.dataTransfer.getData("text/plain"));
          if (id) onStatus(id, stage);
          setDraggingId(null);
          setDragOverStage(null);
        };
        const cardList = (
          <>
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
                onOpenDetail={() => setDetailId(a.id)}
                onMove={(status) => move(a, status)}
              />
            ))}
            {cards.length === 0 && (
              <div className="bempty">
                {stage === "offer"
                  ? t("empty.boardKeepPushing")
                  : t("empty.boardEmpty")}
              </div>
            )}
          </>
        );

        // Desktop's columns sit side by side and never needed the
        // mobile collapse behavior, so it gets a plain always-visible
        // section with zero toggle affordance — no <details>, no
        // chevron, no click-to-collapse (#47).
        if (isDesktop) {
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
                <span className="n">{cards.length}</span>
              </div>
              {cardList}
            </div>
          );
        }

        return (
          <details
            key={stage}
            className={className}
            open={isOpen}
            onToggle={(e) =>
              setManualOpen((m) => ({
                ...m,
                [stage]: (e.target as HTMLDetailsElement).open,
              }))
            }
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <summary className="bcol-head">
              {t(`stages.${stage}`)}
              <span className="n">{cards.length}</span>
            </summary>
            {cardList}
          </details>
        );
      })}
      </div>
    )}
      <div className="board-summary">
        <NextUpPanel applications={applications} />
      </div>
      {detailApp && (
        <ApplicationDetailModal
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

function Timeline({
  resource,
  targetId,
  onError,
}: {
  resource: "applications" | "contacts";
  targetId: number;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Interaction[] | null>(null);
  const [form, setForm] = useState({ type: "email", happened_at: today(), notes: "" });

  const load = useCallback(
    () =>
      api
        .interactions(resource, targetId)
        .then(setItems)
        .catch((e) => onError((e as Error).message)),
    [resource, targetId, onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    api
      .addInteraction(resource, targetId, {
        type: form.type,
        happened_at: form.happened_at,
        notes: form.notes || null,
      })
      .then(() => {
        setForm({ type: "email", happened_at: today(), notes: "" });
        return load();
      })
      .catch((err) => onError((err as Error).message));
  };

  return (
    <div className="timeline">
      <form className="tl-add" onSubmit={add}>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          aria-label="Interaction type"
        >
          {INTERACTION_TYPES.map((it) => (
            <option key={it} value={it}>
              {t(`interactionTypes.${it}`)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={form.happened_at}
          onChange={(e) => setForm({ ...form, happened_at: e.target.value })}
          aria-label="Interaction date"
        />
        <input
          placeholder="What happened?"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <button type="submit" className="primary">
          {t("common.log")}
        </button>
      </form>
      <ul className="tl-items">
        {(items ?? []).map((it) => (
          <li key={it.id}>
            <span className="tl-type">{t(`interactionTypes.${it.type}`)}</span>
            <span className="tl-date">{formatDate(it.happened_at)}</span>
            <span className="tl-notes">
              {it.notes ?? ""}
              {it.via_contact ? <span className="badge">via contact</span> : null}
            </span>
            <button
              className="tl-del danger"
              aria-label={t("common.delete")}
              onClick={() =>
                api
                  .remove("interactions", it.id)
                  .then(load)
                  .catch((e) => onError((e as Error).message))
              }
            >
              <RemoveIcon />
            </button>
          </li>
        ))}
        {items?.length === 0 && (
          <li className="tl-empty">{t("detail.noTouchpoints")}</li>
        )}
      </ul>
    </div>
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
          placeholder="Label (CV v3, cover letter, …)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className={`upload-btn${busy ? " busy" : ""}`}>
          {busy ? "Uploading…" : t("detail.attachFile")}
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
              onClick={() => {
                if (confirm(`Delete "${d.filename}"?`))
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

function parseSqlDate(d: string): number {
  return new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z").getTime();
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Annualized midpoint, for sorting/comparing offers on a common basis
function annualizedComp(a: Application): number | null {
  if (a.salary_min == null && a.salary_max == null) return null;
  const mid =
    a.salary_max != null && a.salary_min != null
      ? (a.salary_min + a.salary_max) / 2
      : (a.salary_max ?? a.salary_min)!;
  return a.salary_period === "month" ? mid * 12 : mid;
}

function formatComp(a: Application): string {
  const cur = a.salary_currency ?? "";
  const per = a.salary_period === "month" ? "/mo" : "/yr";
  if (a.salary_min != null && a.salary_max != null) {
    return `${cur} ${a.salary_min.toLocaleString()}–${a.salary_max.toLocaleString()}${per}`;
  }
  const one = a.salary_max ?? a.salary_min;
  return one != null ? `${cur} ${one.toLocaleString()}${per}` : "—";
}

// Rough total-comp estimate for offer-stage applications: base +
// signing bonus + bonus target (% of base) + a flat annualized equity
// estimate. Deliberately approximate (issue #63) — equity/bonus
// numbers are estimates, not contractual, so this is never shown as
// a bare precise figure, only prefixed with "~" and paired with a
// hover breakdown.
function totalComp(a: Application): number | null {
  const base = annualizedComp(a);
  if (base == null) return null;
  const bonus = a.bonus_target_pct != null ? (base * a.bonus_target_pct) / 100 : 0;
  return base + (a.signing_bonus ?? 0) + bonus + (a.equity_value ?? 0);
}

function totalCompBreakdown(a: Application): string {
  const base = annualizedComp(a);
  if (base == null) return "";
  const parts = [`base ~${Math.round(base).toLocaleString()}`];
  if (a.signing_bonus) parts.push(`signing ${a.signing_bonus.toLocaleString()}`);
  if (a.bonus_target_pct) {
    const bonus = Math.round((base * a.bonus_target_pct) / 100);
    parts.push(`bonus target ${a.bonus_target_pct}% (~${bonus.toLocaleString()})`);
  }
  if (a.equity_value) parts.push(`equity ~${a.equity_value.toLocaleString()}/yr`);
  return parts.join(" + ");
}

function StatsTab({ onError }: { onError: (m: string | null) => void }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [fullApps, setFullApps] = useState<Application[] | null>(null);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => onError((e as Error).message));
    api
      .list<Application>("applications")
      .then(setFullApps)
      .catch((e) => onError((e as Error).message));
  }, [onError]);

  if (!stats) return <p className="muted small">Loading stats…</p>;
  const { applications: apps, history } = stats;

  const comparing = (fullApps ?? [])
    .filter((a) => a.status === "interview" || a.status === "offer")
    .sort((a, b) => (annualizedComp(b) ?? -1) - (annualizedComp(a) ?? -1));

  // Applications per week, last 8 weeks. Uses applied_at (when the lead
  // actually moved) rather than created_at (when it was logged in the
  // app, which can be days or weeks after the fact).
  const WEEK = 7 * 86400000;
  const now = Date.now();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = now - (7 - i) * WEEK;
    const count = apps.filter((a) => {
      const t = parseSqlDate(a.applied_at ?? a.created_at);
      return t >= start && t < start + WEEK;
    }).length;
    // Same "16 Jul"-style format as formatDate() elsewhere (#125) — this
    // used to be its own "28/5" convention, the only one in the app.
    const label = new Date(start).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
    return { label, count };
  });
  const weekMax = Math.max(1, ...weeks.map((w) => w.count));

  // Momentum streak (#145) — consecutive weeks (ending this week) with
  // any job-search activity: a new application, or any logged status
  // change. Broader than the applications-per-week count above, since a
  // week with only interviews/follow-ups and no new application still
  // counts as an active week.
  const activityWeeks = weeks.map((w, i) => {
    const start = now - (7 - i) * WEEK;
    const hasHistory = history.some((h) => {
      const t = parseSqlDate(h.changed_at);
      return t >= start && t < start + WEEK;
    });
    return w.count > 0 || hasHistory;
  });
  let streak = 0;
  for (let i = activityWeeks.length - 1; i >= 0; i--) {
    if (activityWeeks[i]) streak++;
    else break;
  }
  const streakBroken = streak === 0 && activityWeeks.slice(0, -1).some(Boolean);

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

  return (
    <section className="stats">
      <div className={`momentum momentum-${momentum}`}>
        <span className="momentum-label">{t("stats.momentumLabel")}</span>
        <span className="momentum-value">{t(`stats.momentum.${momentum}`)}</span>
        <span className="muted small">
          {t("stats.momentumDetail", { recent: recentMoves, prior: priorMoves })}
        </span>
      </div>

      <MomentumStreak streak={streak} broken={streakBroken} />

      <h2 className="stat-h">{t("stats.appsPerWeek")}</h2>
      <div className="histo">
        {weeks.map((w) => (
          <div key={w.label} className="hrow" title={`Week of ${w.label}: ${w.count}`}>
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

      <h2 className="stat-h">{t("stats.pipelineFunnel")}</h2>
      <div className="histo">
        {funnel.map((f) => (
          <div
            key={f.stage}
            className={`hrow stage-${f.stage}`}
            title={`${f.count} reached ${f.stage}`}
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

      <h2 className="stat-h">{t("stats.avgTimeInStage")}</h2>
      <ul className="stat-list">
        {PIPELINE.filter((s) => stageDays.has(s)).map((s) => {
          const d = stageDays.get(s)!;
          return (
            <li key={s} className={`stage-${s}`}>
              <span className="stat-dot" aria-hidden="true" />
              <span className="stage-name">{t(`stages.${s}`)}</span>
              <span className="stat-val">{(d.total / d.n).toFixed(1)}d</span>
            </li>
          );
        })}
        {stageDays.size === 0 && <li className="tl-empty">{t("stats.noHistory")}</li>}
      </ul>

      <h2 className="stat-h">{t("stats.ghostRate")}</h2>
      <ul className="stat-list">
        {[...bySource.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([src, v]) => (
            <li key={src}>
              <span>{src === UNKNOWN_SOURCE ? t("stats.unknownSource") : src}</span>
              <span className="muted small">{v.total} apps</span>
              <span className="stat-val">
                {Math.round((v.ghosted / v.total) * 100)}% ghosted
              </span>
            </li>
          ))}
        {bySource.size === 0 && <li className="tl-empty">No applications yet.</li>}
      </ul>

      <h2 className="stat-h">{t("stats.compare")}</h2>
      <div className="compare-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Company</th>
              <th>Stage</th>
              <th>Comp</th>
              <th>{t("offer.totalComp")}</th>
              <th>Notes</th>
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
          <p className="tl-empty">
            Nothing at interview or offer stage yet. Add min/max/currency on a
            job's edit form once it gets there.
          </p>
        )}
      </div>

      <h2 className="stat-h">{t("stats.exportData")}</h2>
      <p className="export-links">
        <a href="/api/export" download>
          Everything (JSON)
        </a>
        {["applications", "companies", "contacts", "interactions"].map(
          (t) => (
            <a key={t} href={`/api/export/${t}.csv`} download>
              {t} (CSV)
            </a>
          ),
        )}
      </p>
    </section>
  );
}

function FeedSettings({
  roleTypes,
  onRoleTypesChanged,
  onError,
  notify,
}: {
  roleTypes: RoleTypeDef[];
  onRoleTypesChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<{
    sources: { source: string; enabled: number; location: string | null }[];
    keywords: { id: number; role_slug: string; keyword: string }[];
  } | null>(null);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newKeyword, setNewKeyword] = useState<Record<string, string>>({});

  const loadConfig = useCallback(
    () =>
      api
        .feedConfig()
        .then(setConfig)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const addRole = (e: FormEvent) => {
    e.preventDefault();
    if (!newRoleLabel.trim()) return;
    api
      .createRoleType(newRoleLabel.trim())
      .then(() => {
        setNewRoleLabel("");
        notify("Role type added");
        return onRoleTypesChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  const renameRole = (r: RoleTypeDef, label: string) => {
    if (!label.trim() || label === r.label) return;
    api
      .updateRoleType(r.id, { label: label.trim() })
      .then(onRoleTypesChanged)
      .catch((e) => onError((e as Error).message));
  };

  const removeRole = (r: RoleTypeDef) => {
    if (!confirm(`Delete role type "${r.label}"? Feed keywords for it go too.`))
      return;
    api
      .deleteRoleType(r.id)
      .then(() => {
        notify(`Deleted "${r.label}"`);
        return Promise.all([onRoleTypesChanged(), loadConfig()]);
      })
      .catch((e) => onError((e as Error).message));
  };

  const saveSource = (
    source: string,
    enabled: boolean,
    location: string | null,
  ) => {
    api
      .updateFeedSource(source, { enabled, location })
      .then(() => {
        notify(`Saved ${source} settings`);
        return loadConfig();
      })
      .catch((e) => onError((e as Error).message));
  };

  const addKeyword = (roleSlug: string) => {
    const kw = (newKeyword[roleSlug] ?? "").trim();
    if (!kw) return;
    api
      .addFeedKeyword(roleSlug, kw)
      .then(() => {
        setNewKeyword((m) => ({ ...m, [roleSlug]: "" }));
        return loadConfig();
      })
      .catch((e) => onError((e as Error).message));
  };

  const removeKeyword = (id: number) => {
    api
      .deleteFeedKeyword(id)
      .then(loadConfig)
      .catch((e) => onError((e as Error).message));
  };

  if (!config) return <p className="muted small">Loading settings…</p>;

  return (
    <div className="feed-settings">
      <h3 className="detail-sub">{t("feedSettings.roleTypes")}</h3>
      <ul className="settings-list">
        {roleTypes.map((r) => (
          <li key={r.id}>
            <input
              defaultValue={r.label}
              onBlur={(e) => renameRole(r, e.target.value)}
            />
            <button className="danger" onClick={() => removeRole(r)}>
              <RemoveIcon />
            </button>
          </li>
        ))}
      </ul>
      <form className="settings-add" onSubmit={addRole}>
        <input
          placeholder={t("feedSettings.newRoleType")}
          value={newRoleLabel}
          onChange={(e) => setNewRoleLabel(e.target.value)}
        />
        <button type="submit" className="primary">
          {t("feedSettings.add")}
        </button>
      </form>

      <h3 className="detail-sub">{t("feedSettings.sources")}</h3>
      <ul className="settings-list">
        {config.sources.map((s) => (
          <li key={s.source} className="source-row">
            <label className="checkbox">
              <input
                type="checkbox"
                defaultChecked={!!s.enabled}
                onChange={(e) =>
                  saveSource(s.source, e.target.checked, s.location)
                }
              />
              {s.source}
            </label>
            <input
              placeholder={
                s.source === "adzuna"
                  ? t("feedSettings.countryCode")
                  : t("feedSettings.locationFilter")
              }
              defaultValue={s.location ?? ""}
              onBlur={(e) =>
                saveSource(s.source, !!s.enabled, e.target.value || null)
              }
            />
          </li>
        ))}
      </ul>

      <h3 className="detail-sub">{t("feedSettings.searchKeywords")}</h3>
      {roleTypes.map((r) => {
        const kws = config.keywords.filter((k) => k.role_slug === r.slug);
        return (
          <div key={r.id} className="keyword-group">
            <span className="muted small">{r.label}</span>
            <div className="keyword-chips">
              {kws.map((k) => (
                <span key={k.id} className="chip">
                  {k.keyword}
                  <button
                    onClick={() => removeKeyword(k.id)}
                    aria-label={t("feedSettings.removeKeyword")}
                  >
                    <RemoveIcon />
                  </button>
                </span>
              ))}
              <input
                placeholder={t("feedSettings.keywordPlaceholder")}
                value={newKeyword[r.slug] ?? ""}
                onChange={(e) =>
                  setNewKeyword((m) => ({ ...m, [r.slug]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword(r.slug);
                  }
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FeedTab({
  onError,
  notify,
  roleTypes,
  onRoleTypesChanged,
}: {
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
  roleTypes: RoleTypeDef[];
  onRoleTypesChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const load = useCallback(
    () => api.feed().then(setItems).catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    api
      .refreshFeed()
      .then((r) => {
        notify(`Found ${r.inserted} new of ${r.seen} checked`);
        return load();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setRefreshing(false));
  };

  const dismiss = (item: FeedItem) => {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    api
      .dismissFeedItem(item.id)
      .catch((e) => onError((e as Error).message));
  };

  const add = (item: FeedItem) => {
    api
      .addFeedItem(item.id)
      .then(() => {
        setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
        notify(`Added "${item.title}" to Jobs`);
      })
      .catch((e) => onError((e as Error).message));
  };

  // Desktop keyboard triage (#144) — mirrors the Jobs tab's j/k pattern
  // (#39): j/k move focus, a adds the focused item, d dismisses it. The
  // swipe gesture from the same issue is mobile-only (a mouse-drag
  // simulation of a touch gesture reads as gimmicky, not efficient); both
  // input methods keep the existing buttons as the accessible fallback.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const list = items ?? [];
      if (e.key === "j") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, list.length - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "a") {
        const target = list[focusedIndex];
        if (target) {
          e.preventDefault();
          add(target);
        }
      } else if (e.key === "d") {
        const target = list[focusedIndex];
        if (target) {
          e.preventDefault();
          dismiss(target);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, focusedIndex]);

  return (
    <section>
      <div className="toolbar">
        <p className="muted small" style={{ margin: 0 }}>
          {t("feed.pulledFrom")}
        </p>
        <button
          className="btn-secondary"
          onClick={() => setShowSettings((v) => !v)}
        >
          {showSettings ? t("feed.hideSettings") : t("feed.settings")}
        </button>
        <button className="primary" disabled={refreshing} onClick={refresh}>
          {refreshing ? t("feed.checking") : t("feed.checkNow")}
        </button>
      </div>

      {showSettings && (
        <FeedSettings
          roleTypes={roleTypes}
          onRoleTypesChanged={onRoleTypesChanged}
          onError={onError}
          notify={notify}
        />
      )}

      <ul className="cards">
        {(items ?? []).map((item, i) => (
          <FeedCard
            key={item.id}
            item={item}
            roleLabel={roleTypes.find((r) => r.slug === item.role_type)?.label ?? item.role_type}
            focused={i === focusedIndex}
            onAdd={() => add(item)}
            onDismiss={() => dismiss(item)}
          />
        ))}
        {items?.length === 0 && (
          <li className="empty">{t("empty.feedNothingNew")}</li>
        )}
      </ul>
    </section>
  );
}

// Mobile swipe-to-triage (#144) — swipe right to add, left to dismiss.
// Desktop keeps the buttons plus j/k/a/d (see FeedTab); a mouse-drag
// simulation of the same gesture was rejected as gimmicky for a pointer
// device, so this only activates via touch.
const SWIPE_COMMIT_THRESHOLD = 90;

function FeedCard({
  item,
  roleLabel,
  focused,
  onAdd,
  onDismiss,
}: {
  item: FeedItem;
  roleLabel: string;
  focused: boolean;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    setDragX(e.touches[0].clientX - startX.current);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (dragX > SWIPE_COMMIT_THRESHOLD) onAdd();
    else if (dragX < -SWIPE_COMMIT_THRESHOLD) onDismiss();
    setDragX(0);
  };

  return (
    <li
      className={`card feed-card${focused ? " kb-focused" : ""}${dragX > 0 ? " swipe-add" : dragX < 0 ? " swipe-dismiss" : ""}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={dragging ? { transform: `translateX(${dragX}px)` } : undefined}
    >
      <div className="card-body">
        <div className="card-main">
          <strong>{item.title}</strong>
          <span className="muted small">
            {[item.company, item.location].filter(Boolean).join(" · ")}
          </span>
          <span className="muted small">
            {roleLabel}
            {item.salary_text ? ` · ${item.salary_text}` : ""}
            {" · via "}
            {item.source}
          </span>
          {safeHref(item.url) && (
            <a href={safeHref(item.url)} target="_blank" rel="noreferrer" className="small">
              View posting ↗
            </a>
          )}
        </div>
        <div className="card-actions">
          <button className="primary" onClick={onAdd}>
            Add to Jobs
          </button>
          <button onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    </li>
  );
}

function agendaText(
  e: AgendaEntry,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const where = [e.company_name, e.contact_name].filter(Boolean).join(" · ");
  if (e.kind === "due") {
    return `${e.label ?? t("agenda.followUp")} — ${e.title ?? ""}${where ? ` (${where})` : ""}`;
  }
  if (e.kind === "interaction") {
    const label = e.type ? t(`interactionTypes.${e.type}`) : t("agenda.touchpoint");
    return `${label}${e.title ? ` — ${e.title}` : ""}${where ? ` (${where})` : ""}`;
  }
  return `${t("agenda.appliedTo")} ${e.title ?? ""}${where ? ` ${t("agenda.at")} ${where}` : ""}`;
}

function CalendarTab({
  onError,
  onJump,
}: {
  onError: (message: string | null) => void;
  onJump: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AgendaEntry[] | null>(null);

  useEffect(() => {
    api
      .agenda()
      .then(setEntries)
      .catch((e) => onError((e as Error).message));
  }, [onError]);

  if (!entries) return <p className="muted small">Loading agenda…</p>;

  const todayStr = today();
  const groups = new Map<string, AgendaEntry[]>();
  for (const e of entries) {
    const day = e.date.slice(0, 10);
    const list = groups.get(day) ?? [];
    list.push(e);
    groups.set(day, list);
  }
  const days = [...groups.keys()].sort();

  return (
    <section className="agenda">
      {days.length === 0 && (
        <p className="empty">
          Nothing on the agenda yet. Due dates, logged touchpoints, and
          applied dates all show up here.
        </p>
      )}
      {days.map((day) => (
        <div key={day} className="agenda-day">
          <h3
            className={`agenda-date${day === todayStr ? " today" : day < todayStr ? " past" : ""}`}
          >
            {formatDate(day)}
            {day === todayStr ? " · today" : ""}
          </h3>
          <ul className="agenda-items">
            {(groups.get(day) ?? []).map((e) => (
              <li
                key={`${e.kind}-${e.id}`}
                className={`agenda-item kind-${e.kind}`}
                onClick={() => e.title && onJump(e.title)}
              >
                {agendaText(e, t)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// Activity feed (#129) — reverse-chronological across every application:
// status changes, interactions, documents attached. Distinct from the
// per-application timeline in the detail modal, which only covers one job.
function activityText(
  e: ActivityEvent,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const co = e.company_name ? ` · ${e.company_name}` : "";
  if (e.kind === "status") {
    const from = e.from_status ? t(`stages.${e.from_status}`) : null;
    const to = e.to_status ? t(`stages.${e.to_status}`) : "";
    return `${e.title}${co} — ${from ? `${from} → ${to}` : to}`;
  }
  if (e.kind === "interaction") {
    const type = e.type ? t(`interactionTypes.${e.type}`) : "";
    return `${type} logged on ${e.title}${co}${e.notes ? ` — ${e.notes}` : ""}`;
  }
  return `${e.filename} attached to ${e.title}${co}`;
}

function ActivityTab({
  onError,
  onOpenJob,
}: {
  onError: (message: string | null) => void;
  onOpenJob: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);

  useEffect(() => {
    api
      .activity()
      .then(setEvents)
      .catch((e) => onError((e as Error).message));
  }, [onError]);

  if (!events) return <LoadingSkeleton />;

  return (
    <section className="activity">
      {events.length === 0 && (
        <p className="empty">{t("activityFeed.empty")}</p>
      )}
      <ul className="activity-list">
        {events.map((e, i) => (
          <li
            key={i}
            className={`activity-item kind-${e.kind}`}
            onClick={() => onOpenJob(e.application_id)}
          >
            <span className="activity-date">{formatDate(e.ts.slice(0, 10))}</span>
            <span className="activity-text">{activityText(e, t)}</span>
          </li>
        ))}
      </ul>
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

  const addItem = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    api
      .create(`applications/${applicationId}/prep-items`, { text: trimmed })
      .then(() => {
        setNewText("");
        return load();
      })
      .catch((e) => onError((e as Error).message));
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
        {items.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={!!item.done}
                onChange={() => toggleDone(item)}
              />
              {item.text}
            </label>
            <button
              className="danger"
              onClick={() => removeItem(item.id)}
              aria-label={t("common.delete")}
            >
              <RemoveIcon />
            </button>
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
        <button onClick={() => addItem(newText)}>{t("common.save")}</button>
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

  const generate = () => {
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
      .catch((e) => onError((e as Error).message));
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
        <button onClick={generate}>{t("coverLetter.generateDraft")}</button>
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
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [jdText, setJdText] = useState("");
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
  const [editing, setEditing] = useState(false);
  const [newTag, setNewTag] = useState("");
  const a = application;

  useEffect(() => {
    if (asPane) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, asPane]);

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
        className={asPane ? "detail-pane" : "modal detail-modal"}
        onClick={asPane ? undefined : (e) => e.stopPropagation()}
        role={asPane ? "region" : "dialog"}
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
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {editing ? (
          <ApplicationForm
            initial={a}
            companies={companies}
            contacts={contacts}
            roleTypes={roleTypes}
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
              {a.fit_score ? (
                <div>
                  <span className="field-label">{t("detail.fitScore")}</span>
                  <span className="fit-stars">{"★".repeat(a.fit_score)}</span>
                </div>
              ) : null}
              {safeHref(a.url) && (
                <a href={safeHref(a.url)} target="_blank" rel="noreferrer" className="small">
                  Job posting ↗
                </a>
              )}
              {a.source && <span className="muted small">via {a.source}</span>}
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
              {a.applied_at && (
                <span className="muted small">
                  Applied {formatDate(a.applied_at)}
                </span>
              )}
              {(a.next_action || a.next_action_at) && (
                <span
                  className={`due-line${isOverdue(a) ? " late" : isDue(a) ? " today" : ""}`}
                >
                  → {a.next_action ?? "follow up"}
                  {a.next_action_at ? ` · ${formatDate(a.next_action_at)}` : ""}
                </span>
              )}
              {a.notes && <p className="notes">{a.notes}</p>}
            </div>

            <div className="keyword-chips">
              {a.tags.map((tg) => (
                <span key={tg.id} className="chip">
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
            <JdKeywordMatch onError={onError} />

            <h3 className="detail-sub">{t("detail.timeline")}</h3>
            <Timeline resource="applications" targetId={a.id} onError={onError} />

            <h3 className="detail-sub">{t("detail.documents")}</h3>
            <Documents applicationId={a.id} onError={onError} />
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

// Overview home screen (#128) — the new landing tab, replacing "always
// opens on Jobs." One glanceable screen: a headline pipeline number, the
// existing next-actions panel, and a recent-activity list built from the
// same applications data already loaded app-wide (no extra fetch).
function OverviewTab({
  applications,
  onGoToJobs,
  onOpenJob,
}: {
  applications: Application[];
  onGoToJobs: () => void;
  onOpenJob: (id: number) => void;
}) {
  const { t } = useTranslation();
  const open = applications.filter((a) => !isDead(a.status));
  const interviewing = open.filter(
    (a) => a.status === "interview" || a.status === "offer",
  ).length;

  const recent = [...applications]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);

  return (
    <section className="overview">
      <div className="overview-headline">
        <span className="overview-number">{open.length}</span>
        <span className="overview-label">
          {t("overview.openCount", { count: open.length })}
        </span>
        {interviewing > 0 && (
          <span className="overview-sub">
            {t("overview.interviewingCount", { count: interviewing })}
          </span>
        )}
      </div>

      <NextUpPanel applications={applications} />

      <h3 className="side-h">{t("overview.recentActivity")}</h3>
      {recent.length === 0 ? (
        <p className="muted small">{t("overview.noActivity")}</p>
      ) : (
        <ul className="side-list overview-recent">
          {recent.map((a) => (
            <li
              key={a.id}
              className={`stage-${a.status} clickable`}
              onClick={() => onOpenJob(a.id)}
            >
              <span className="side-date">{ageDays(a.updated_at)}</span>
              <span className="side-title">{a.title}</span>
              <span className="side-co">{a.company_name ?? "—"}</span>
              <span className="side-stage">{t(`stages.${a.status}`)}</span>
            </li>
          ))}
        </ul>
      )}

      <button className="primary overview-cta" onClick={onGoToJobs}>
        {t("overview.viewAllJobs")}
      </button>
    </section>
  );
}

function NextUpPanel({ applications }: { applications: Application[] }) {
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
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function ApplicationsTab({
  applications,
  companies,
  contacts,
  roleTypes,
  onChanged,
  onError,
  notify,
  onDelete,
  onStatus,
  initialQuery,
  initialDetailId,
  onDetailIdChange,
  quickAddSignal,
}: CrudTabProps & {
  applications: Application[];
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
  onStatus: (id: number, status: Status) => void;
  initialQuery?: string;
  initialDetailId?: number | null;
  onDetailIdChange?: (id: number | null) => void;
  // Mobile quick-add FAB (#135) — reachable from any tab. A counter that
  // increments on each tap, so opening the form again after closing it
  // still fires even though 0 -> the initial no-op value never does.
  quickAddSignal?: number;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Application | "new" | null>(null);
  useEffect(() => {
    if (quickAddSignal) setEditing("new");
  }, [quickAddSignal]);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState(initialQuery ?? "");
  const [sort, setSort] = useState<"updated" | "applied" | "company">(
    "updated",
  );
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  // Split-pane detail on wide desktop (#131) — same >=1100px breakpoint
  // the two-column .jobs-layout already switches on. Below it, the
  // detail stays a modal overlay (mobile/narrow).
  const [isWideDesktop, setIsWideDesktop] = useState(
    () => window.matchMedia("(min-width: 1100px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const onChange = () => setIsWideDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    api
      .stats()
      .then((s) => setHistory(s.history))
      .catch(() => {});
  }, []);

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

  const allTags = [
    ...new Map(
      applications.flatMap((a) => a.tags).map((tg) => [tg.id, tg]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  // Flag applications quieter than this employer's own typical gap between
  // status changes — a sharper signal than a flat days-since-update, since
  // some companies just move slower than others.
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
  const gapsByCompany = new Map<number, number[]>();
  for (const a of applications) {
    if (a.company_id == null) continue;
    const list = gapsByCompany.get(a.company_id) ?? [];
    list.push(...(gapsByApp.get(a.id) ?? []));
    gapsByCompany.set(a.company_id, list);
  }
  const nowMs = Date.now();
  const quietFlags = new Set<number>();
  // Response-time heat strip (#142) — a graded signal (not just the
  // binary "quiet" badge from #108) of how overdue an application's next
  // contact is relative to that specific employer's own typical gap,
  // shown as a colored strip on the row independent of stage color.
  const FALLBACK_NORM_DAYS = 7;
  const heatLevel = new Map<number, 0 | 1 | 2 | 3>();
  for (const a of applications) {
    if (isDead(a.status) || a.archived_at) continue;
    const companyGaps = a.company_id != null ? (gapsByCompany.get(a.company_id) ?? []) : [];
    const norm =
      companyGaps.length >= 2 ? (median(companyGaps) ?? FALLBACK_NORM_DAYS) : FALLBACK_NORM_DAYS;
    const last = lastActivity.get(a.id) ?? parseSqlDate(a.created_at);
    const daysSince = (nowMs - last) / 86400000;
    const ratio = daysSince / norm;
    const level = ratio >= 2.5 ? 3 : ratio >= 1.5 ? 2 : ratio >= 1 ? 1 : 0;
    heatLevel.set(a.id, level);
    if (companyGaps.length >= 2 && daysSince >= 5 && ratio > 1.5) quietFlags.add(a.id);
  }

  const q = query.trim().toLowerCase();
  const filtered = applications.filter(
    (a) =>
      (showArchived || !a.archived_at) &&
      (statusFilter === "all" || a.status === statusFilter) &&
      (roleFilter === "all" || a.role_type === roleFilter) &&
      (companyFilter === "all" || String(a.company_id) === companyFilter) &&
      (tagFilter === "all" || a.tags.some((tg) => String(tg.id) === tagFilter)) &&
      (!q ||
        [a.title, a.company_name, a.contact_name, a.notes, a.source]
          .filter(Boolean)
          .some((f) => (f as string).toLowerCase().includes(q))),
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "applied")
      return (b.applied_at ?? "").localeCompare(a.applied_at ?? "");
    if (sort === "company")
      return (a.company_name ?? "￿").localeCompare(
        b.company_name ?? "￿",
      );
    return b.updated_at.localeCompare(a.updated_at);
  });
  // Due items pinned on top, most overdue first
  const visible = [
    ...sorted
      .filter(isDue)
      .sort((a, b) =>
        (a.next_action_at ?? "").localeCompare(b.next_action_at ?? ""),
      ),
    ...sorted.filter((a) => !isDue(a)),
  ];

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  const toggleSelect = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkArchive = () => {
    Promise.all([...selected].map((id) => api.archiveApplication(id)))
      .then(() => {
        setSelected(new Set());
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  const bulkSetStatus = (status: Status) => {
    selected.forEach((id) => onStatus(id, status));
    setSelected(new Set());
  };

  // Desktop keyboard shortcuts: / search, n new job, Esc close,
  // j/k move focus, 1-8 set status on the focused card, ? for help.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "?" && !isTyping) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (showHelp) return setShowHelp(false);
        if (editing) return setEditing(null);
        (e.target as HTMLElement).blur?.();
        return;
      }
      if (isTyping) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n") {
        e.preventDefault();
        setEditing("new");
      } else if (e.key === "j") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, visible.length - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (/^[1-8]$/.test(e.key)) {
        const target = visible[focusedIndex];
        const status = STATUSES[Number(e.key) - 1];
        if (target && status) {
          e.preventDefault();
          onStatus(target.id, status);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, editing, showHelp, focusedIndex, onStatus]);

  useEffect(() => {
    if (focusedIndex < 0) return;
    document
      .querySelector(".card.kb-focused")
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  return (
    <section>
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
      <div className="jobs-layout">
      <div className="jobs-main">
      <StageHistogram applications={applications} />
      <div className="toolbar">
        <input
          ref={searchRef}
          type="search"
          className="search"
          placeholder={t("toolbar.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          {t("toolbar.addJob")}
        </button>
        <button
          className="help-btn"
          onClick={() => setShowHelp(true)}
          title={t("toolbar.shortcuts")}
          aria-label={t("toolbar.shortcuts")}
        >
          ?
        </button>
      </div>
      <div className="filters">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | "all")}
        >
          <option value="all">{t("filters.allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`stages.${s}`)}
            </option>
          ))}
        </select>
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
        {allTags.length > 0 && (
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
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="updated">{t("filters.sortUpdated")}</option>
          <option value="applied">{t("filters.sortApplied")}</option>
          <option value="company">{t("filters.sortCompany")}</option>
        </select>
        <label className="show-archived">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t("filters.showArchived")}
        </label>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{t("bulk.selectedCount", { count: selected.size })}</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) bulkSetStatus(e.target.value as Status);
            }}
          >
            <option value="">{t("bulk.setStatus")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`stages.${s}`)}
              </option>
            ))}
          </select>
          <button onClick={bulkArchive}>{t("bulk.archive")}</button>
          <button onClick={() => setSelected(new Set())}>
            {t("bulk.clearSelection")}
          </button>
        </div>
      )}

      {editing && (
        <ApplicationForm
          initial={editing === "new" ? null : editing}
          companies={companies}
          contacts={contacts}
          roleTypes={roleTypes}
          onError={onError}
          onCancel={() => setEditing(null)}
          onSubmit={(data) =>
            run(() =>
              editing === "new"
                ? api.create("applications", data)
                : api.update("applications", editing.id, data),
            )
          }
        />
      )}

      <ul className="cards">
        {visible.map((a, i) => (
          <li
            key={a.id}
            className={`card row2 stage-${a.status} heat-${heatLevel.get(a.id) ?? 0}${isOverdue(a) ? " overdue" : ""}${i === focusedIndex ? " kb-focused" : ""}${a.archived_at ? " archived" : ""}`}
            onClick={() => setDetailId(a.id)}
          >
            <div className="l1">
              <input
                type="checkbox"
                className="card-select"
                checked={selected.has(a.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSelect(a.id)}
                aria-label={t("bulk.selectRow")}
              />
              <strong>
                {a.title}
                {a.fit_score ? (
                  <span className="fit-stars" title={`${a.fit_score}/5`}>
                    {" "}
                    {"★".repeat(a.fit_score)}
                  </span>
                ) : null}
                {a.archived_at ? (
                  <span className="badge" title={t("filters.showArchived")}>
                    {" "}
                    {t("detail.archived")}
                  </span>
                ) : null}
                {a.referred_by_contact_id ? (
                  <span className="badge" title={t("referral.referredBy")}>
                    {" "}
                    {t("referral.badge")}
                  </span>
                ) : null}
                {a.posting_status === "maybe_stale" ? (
                  <span className="badge warn" title={t("posting.staleHint")}>
                    {" "}
                    {t("posting.staleBadge")}
                  </span>
                ) : null}
                {(() => {
                  const level = heatLevel.get(a.id) ?? 0;
                  if (level === 0) return null;
                  const key = level === 3 ? "cold" : level === 2 ? "quiet" : "watch";
                  return (
                    <span
                      className={`badge heat-badge heat-badge-${level}`}
                      title={t(`heat.${key}Hint`)}
                    >
                      {" "}
                      {t(`heat.${key}Badge`)}
                    </span>
                  );
                })()}
              </strong>
              <span className="co">
                {a.company_name ?? "—"}
                {a.contact_name ? ` · ${a.contact_name}` : ""}
              </span>
            </div>
            <div className="l2">
              <span className={`pill stage-${a.status}`}>
                {t(`stages.${a.status}`)}
              </span>
              <span
                className={`due${isOverdue(a) ? " late" : isDue(a) ? " today" : ""}`}
              >
                {isDue(a) || isOverdue(a)
                  ? `→ ${a.next_action ?? "follow up"}`
                  : `upd ${ageDays(a.updated_at)}`}
              </span>
              {a.deadline_at && (isDeadlineSoon(a) || isDeadlinePast(a)) && (
                <span className={`due${isDeadlinePast(a) ? " late" : " today"}`}>
                  {t("detail.deadline")}: {formatDate(a.deadline_at)}
                </span>
              )}
              {quietFlags.has(a.id) && (
                <span className="due late" title={t("detail.quietDetail")}>
                  {t("detail.quiet")}
                </span>
              )}
              {a.tags.map((tg) => (
                <span key={tg.id} className="tag-chip">
                  {tg.name}
                </span>
              ))}
            </div>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="empty">
            <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
              <line x1="20" y1="76" x2="70" y2="26" strokeWidth="5" opacity="0.28" strokeLinecap="round" />
              <circle cx="20" cy="76" r="7" fill="currentColor" stroke="none" />
              <circle cx="36.7" cy="59.3" r="7" fill="currentColor" stroke="none" />
              <circle cx="53.3" cy="42.7" r="7" fill="currentColor" stroke="none" opacity="0.35" />
              <circle cx="72" cy="24" r="11" strokeWidth="5.5" className="accent-stroke" />
            </svg>
            {t("empty.noJobs")}
          </li>
        )}
      </ul>
      </div>
      {isWideDesktop && detailApp ? (
        <ApplicationDetailModal
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
          asPane
        />
      ) : (
        <NextUpPanel applications={applications.filter((a) => !a.archived_at)} />
      )}
      </div>
      {!isWideDesktop && detailApp && (
        <ApplicationDetailModal
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
    </section>
  );
}

function ApplicationForm({
  initial,
  companies,
  contacts,
  roleTypes,
  onSubmit,
  onCancel,
  onError,
}: {
  initial: Application | null;
  companies: Company[];
  contacts: Contact[];
  roleTypes: RoleTypeDef[];
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
  const set = (patch: Partial<Application>) =>
    setForm((f) => ({ ...f, ...patch }));

  const allCompanies = [...companies, ...extraCompanies];

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
        onSubmit(form);
      }}
    >
      <div className="form-group">
        <h4>Basics</h4>
        <label>
          Title *
          <input
            required
            value={form.title ?? ""}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label>
          Role type
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
          Company
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
          Contact
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
        <h4>Posting &amp; compensation</h4>
        <label>
          URL
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
          Source
          <input
            placeholder="LinkedIn, referral, …"
            value={form.source ?? ""}
            onChange={(e) => set({ source: e.target.value || null })}
          />
        </label>
        <label>
          Salary range
          <input
            placeholder="freeform, e.g. from a job posting"
            value={form.salary_range ?? ""}
            onChange={(e) => set({ salary_range: e.target.value || null })}
          />
        </label>
        <label>
          Currency
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
          Min
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
          Max
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
          Per
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
            <option value="year">year</option>
            <option value="month">month</option>
          </select>
        </label>
        <label>
          Applied on
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
        <h4>Follow-up</h4>
        <label>
          Next action
          <input
            placeholder="Nudge recruiter, prep case study, …"
            value={form.next_action ?? ""}
            onChange={(e) => set({ next_action: e.target.value || null })}
          />
        </label>
        <label>
          Next action due
          <input
            type="date"
            value={form.next_action_at ?? ""}
            onChange={(e) => set({ next_action_at: e.target.value || null })}
          />
        </label>
        <label>
          Application deadline
          <input
            type="date"
            value={form.deadline_at ?? ""}
            onChange={(e) => set({ deadline_at: e.target.value || null })}
          />
        </label>
        <label>
          Fit score
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
          Notes
          <textarea
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => set({ notes: e.target.value || null })}
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="submit" className="primary">
          {t("common.save")}
        </button>
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function CompaniesTab({
  companies,
  applications,
  contacts,
  onChanged,
  onError,
  notify,
  onDelete,
  initialQuery,
}: CrudTabProps & {
  companies: Company[];
  applications: Application[];
  contacts: Contact[];
  initialQuery?: string;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [detailId, setDetailId] = useState<number | null>(null);
  const detailCompany = companies.find((c) => c.id === detailId) ?? null;
  // Logo-first card grid (#132) — scans faster once tracking a dozen+
  // companies than the list rows do. Persisted so the choice sticks
  // across visits/reloads.
  const [view, setView] = useState<"list" | "grid">(
    () => (localStorage.getItem("jobseekr_companies_view") as "list" | "grid" | null) ?? "list",
  );
  const setViewAndPersist = (v: "list" | "grid") => {
    setView(v);
    localStorage.setItem("jobseekr_companies_view", v);
  };

  const q = query.trim().toLowerCase();
  const visible = companies.filter(
    (c) =>
      !q ||
      [c.name, c.location, c.notes, c.website]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q)),
  );

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder={t("toolbar.searchCompanies")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          {t("toolbar.addCompany")}
        </button>
        <div className="board-group-toggle" role="group" aria-label={t("companies.view")}>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setViewAndPersist("list")}
          >
            {t("companies.viewList")}
          </button>
          <button
            className={view === "grid" ? "active" : ""}
            onClick={() => setViewAndPersist("grid")}
          >
            {t("companies.viewGrid")}
          </button>
        </div>
      </div>

      {editing && (
        <CompanyForm
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSubmit={(data) =>
            run(() =>
              editing === "new"
                ? api.create("companies", data)
                : api.update("companies", editing.id, data),
            )
          }
        />
      )}

      {view === "grid" ? (
        <ul className="company-grid">
          {visible.map((c) => (
            <li
              key={c.id}
              className="company-tile"
              onClick={() => setDetailId(c.id)}
            >
              {c.logo_url ? (
                <img className="company-logo" src={c.logo_url} alt="" />
              ) : (
                <div className="company-logo company-logo-placeholder" aria-hidden="true">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="company-tile-name">
                {c.name}
                {c.is_agency ? <span className="badge"> agency</span> : null}
              </span>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="empty">
              <EmptyCompaniesIcon />
              {companies.length === 0
                ? t("empty.noCompanies")
                : t("empty.noCompaniesMatch")}
            </li>
          )}
        </ul>
      ) : (
      <ul className="cards">
        {visible.map((c) => {
          const referrals = applications.filter(
            (a) =>
              a.company_id === c.id &&
              a.referred_by_contact_id &&
              !isDead(a.status),
          ).length;
          return (
          <li
            key={c.id}
            className="card row2"
            onClick={() => setDetailId(c.id)}
          >
            <div className="l1">
              <strong>
                {c.name}
                {c.is_agency ? <span className="badge"> agency</span> : null}
                {referrals > 0 ? (
                  <span className="badge">
                    {" "}
                    {t("referral.badgeCount", { count: referrals })}
                  </span>
                ) : null}
              </strong>
              <span className="co">{c.location ?? ""}</span>
            </div>
            <div className="l2">
              <span className="co">{c.website ?? ""}</span>
              <span className="due">
                {c.researched_at
                  ? `researched ${ageDays(c.researched_at)} ago`
                  : t("company.notResearched")}
              </span>
            </div>
          </li>
          );
        })}
        {visible.length === 0 && (
          <li className="empty">
            <EmptyCompaniesIcon />
            {companies.length === 0
              ? t("empty.noCompanies")
              : t("empty.noCompaniesMatch")}
          </li>
        )}
      </ul>
      )}
      {detailCompany && (
        <CompanyDetailModal
          company={detailCompany}
          contacts={contacts.filter((ct) => ct.company_id === detailCompany.id)}
          applications={applications.filter((a) => a.company_id === detailCompany.id)}
          onClose={() => setDetailId(null)}
          onChanged={onChanged}
          onError={onError}
          notify={notify}
          onDelete={onDelete}
        />
      )}
    </section>
  );
}

function CompanyForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Company | null;
  onSubmit: (data: Partial<Company>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Company>>(initial ?? {});
  const set = (patch: Partial<Company>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        Name *
        <input
          required
          value={form.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label>
        Website
        <input
          type="url"
          value={form.website ?? ""}
          onChange={(e) => set({ website: e.target.value || null })}
        />
      </label>
      <label>
        Location
        <input
          value={form.location ?? ""}
          onChange={(e) => set({ location: e.target.value || null })}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!form.is_agency}
          onChange={(e) => set({ is_agency: e.target.checked ? 1 : 0 })}
        />
        Recruitment agency
      </label>
      <label className="full">
        Notes
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary">
          {t("common.save")}
        </button>
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

// Contact relationship map (#133) — a lightweight org-chart-style view
// under a company: referral chains (referrer → the contact they connected
// you with) built from data already on Application (referred_by_name,
// contact_name), plus any other contacts at the company not part of a
// chain. No new schema — there's no general "reports to" field, just
// what the referral link already captures.
function ContactRelationshipMap({
  contacts,
  applications,
}: {
  contacts: Contact[];
  applications: Application[];
}) {
  const { t } = useTranslation();
  if (contacts.length === 0) return null;

  const referralLinks = [
    ...new Map(
      applications
        .filter((a) => a.referred_by_name && a.contact_name)
        .map((a) => [
          `${a.referred_by_name}->${a.contact_name}`,
          { from: a.referred_by_name!, to: a.contact_name! },
        ]),
    ).values(),
  ];
  const linkedNames = new Set(
    referralLinks.flatMap((l) => [l.from, l.to]),
  );
  const unlinked = contacts.filter((c) => !linkedNames.has(c.name));

  return (
    <div className="contact-map">
      <h3 className="detail-sub">{t("company.contactMap")}</h3>
      {referralLinks.map((l, i) => (
        <div className="contact-map-link" key={i}>
          <span className="contact-map-node">{l.from}</span>
          <span className="contact-map-arrow">→</span>
          <span className="contact-map-node">{l.to}</span>
        </div>
      ))}
      <ul className="contact-map-list">
        {unlinked.map((c) => (
          <li key={c.id}>
            <span className="contact-map-node">{c.name}</span>
            {c.role && <span className="muted small"> · {c.role}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompanyDetailModal({
  company,
  contacts,
  applications,
  onClose,
  onChanged,
  onError,
  notify,
  onDelete,
}: {
  company: Company;
  contacts: Contact[];
  applications: Application[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
  onDelete: (resource: string, id: number, name: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [researching, setResearching] = useState(false);
  const c = company;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const research = () => {
    setResearching(true);
    api
      .researchCompany(c.id)
      .then(() => {
        notify(`Researched ${c.name}`);
        return onChanged();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setResearching(false));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal detail-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={c.name}
      >
        <div className="detail-head">
          <div>
            <h2>
              {c.name}
              {c.is_agency ? <span className="badge"> agency</span> : null}
            </h2>
            <span className="muted small">{c.location ?? ""}</span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {editing ? (
          <CompanyForm
            initial={c}
            onCancel={() => setEditing(false)}
            onSubmit={(data) =>
              api
                .update("companies", c.id, data)
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
            <div className="detail-fields">
              {safeHref(c.website) && (
                <a href={safeHref(c.website)} target="_blank" rel="noreferrer" className="small">
                  {c.website}
                </a>
              )}
              {c.description && (
                <div>
                  <span className="field-label">{t("detail.description")}</span>
                  <p className="notes">{c.description}</p>
                </div>
              )}
              {c.notes && (
                <div>
                  <span className="field-label">{t("detail.notes")}</span>
                  <p className="notes">{c.notes}</p>
                </div>
              )}
              {c.researched_at && (
                <span className="age">
                  researched {ageDays(c.researched_at)} ago
                </span>
              )}
            </div>

            <ContactRelationshipMap contacts={contacts} applications={applications} />

            <div className="detail-actions">
              <button
                disabled={!c.website || researching}
                onClick={research}
              >
                {researching ? t("common.researching") : t("common.research")}
              </button>
              <button onClick={() => setEditing(true)}>{t("common.edit")}</button>
              <button
                className="danger"
                onClick={() => {
                  onDelete("companies", c.id, c.name);
                  onClose();
                }}
              >
                {t("common.delete")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContactsTab({
  contacts,
  companies,
  onChanged,
  onError,
  notify,
  onDelete,
  initialQuery,
}: CrudTabProps & {
  contacts: Contact[];
  companies: Company[];
  initialQuery?: string;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [detailId, setDetailId] = useState<number | null>(null);
  const detailContact = contacts.find((c) => c.id === detailId) ?? null;

  const q = query.trim().toLowerCase();
  const visible = contacts.filter(
    (c) =>
      !q ||
      [c.name, c.role, c.company_name, c.email, c.notes]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q)),
  );

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder={t("toolbar.searchPeople")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          {t("toolbar.addContact")}
        </button>
      </div>

      {editing && (
        <ContactForm
          initial={editing === "new" ? null : editing}
          companies={companies}
          onCancel={() => setEditing(null)}
          onSubmit={(data) =>
            run(() =>
              editing === "new"
                ? api.create("contacts", data)
                : api.update("contacts", editing.id, data),
            )
          }
        />
      )}

      <ul className="cards">
        {visible.map((c) => (
          <li
            key={c.id}
            className="card row2"
            onClick={() => setDetailId(c.id)}
          >
            <div className="l1">
              <strong>{c.name}</strong>
              <span className="co">
                {[c.role, c.company_name].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="l2">
              <span className="co">{c.email ?? c.phone ?? ""}</span>
              {c.outreach_status !== "not_contacted" && (
                <span className={`outreach-pill ${c.outreach_status}`}>
                  {t(`outreach.statuses.${c.outreach_status}`)}
                </span>
              )}
              {c.follow_up_at && (isFollowUpDue(c) || isFollowUpOverdue(c)) && (
                <span
                  className={`due${isFollowUpOverdue(c) ? " late" : " today"}`}
                >
                  {t("outreach.followUpDue")}: {formatDate(c.follow_up_at)}
                </span>
              )}
            </div>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="empty">
            <EmptyPeopleIcon />
            {contacts.length === 0
              ? t("empty.noPeople")
              : t("empty.noPeopleMatch")}
          </li>
        )}
      </ul>
      {detailContact && (
        <ContactDetailModal
          contact={detailContact}
          companies={companies}
          onClose={() => setDetailId(null)}
          onChanged={onChanged}
          onError={onError}
          notify={notify}
          onDelete={onDelete}
        />
      )}
    </section>
  );
}

function ContactForm({
  initial,
  companies,
  onSubmit,
  onCancel,
}: {
  initial: Contact | null;
  companies: Company[];
  onSubmit: (data: Partial<Contact>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Contact>>(initial ?? {});
  const set = (patch: Partial<Contact>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        Name *
        <input
          required
          value={form.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label>
        Role
        <input
          placeholder="Recruiter, hiring manager, …"
          value={form.role ?? ""}
          onChange={(e) => set({ role: e.target.value || null })}
        />
      </label>
      <label>
        {t("outreach.status")}
        <select
          value={form.outreach_status ?? "not_contacted"}
          onChange={(e) =>
            set({ outreach_status: e.target.value as OutreachStatus })
          }
        >
          {OUTREACH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`outreach.statuses.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("outreach.lastContacted")}
        <input
          type="date"
          value={form.last_contacted_at ?? ""}
          onChange={(e) => set({ last_contacted_at: e.target.value || null })}
        />
      </label>
      <label>
        {t("outreach.followUpDue")}
        <input
          type="date"
          value={form.follow_up_at ?? ""}
          onChange={(e) => set({ follow_up_at: e.target.value || null })}
        />
      </label>
      <label>
        Company
        <select
          value={form.company_id ?? ""}
          onChange={(e) =>
            set({ company_id: e.target.value ? Number(e.target.value) : null })
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
      <label>
        Email
        <input
          type="email"
          value={form.email ?? ""}
          onChange={(e) => set({ email: e.target.value || null })}
        />
      </label>
      <label>
        Phone
        <input
          type="tel"
          value={form.phone ?? ""}
          onChange={(e) => set({ phone: e.target.value || null })}
        />
      </label>
      <label>
        LinkedIn
        <input
          type="url"
          value={form.linkedin ?? ""}
          onChange={(e) => set({ linkedin: e.target.value || null })}
        />
      </label>
      <label className="full">
        Notes
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary">
          {t("common.save")}
        </button>
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function ContactDetailModal({
  contact,
  companies,
  onClose,
  onChanged,
  onError,
  notify,
  onDelete,
}: {
  contact: Contact;
  companies: Company[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
  onDelete: (resource: string, id: number, name: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const c = contact;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal detail-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={c.name}
      >
        <div className="detail-head">
          <div>
            <h2>{c.name}</h2>
            <span className="muted small">
              {[c.role, c.company_name].filter(Boolean).join(" · ")}
            </span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {editing ? (
          <ContactForm
            initial={c}
            companies={companies}
            onCancel={() => setEditing(false)}
            onSubmit={(data) =>
              api
                .update("contacts", c.id, data)
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
            <div className="detail-fields">
              {c.email && (
                <a href={`mailto:${c.email}`} className="small">
                  {c.email}
                </a>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="small">
                  {c.phone}
                </a>
              )}
              {safeHref(c.linkedin) && (
                <a href={safeHref(c.linkedin)} target="_blank" rel="noreferrer" className="small">
                  LinkedIn ↗
                </a>
              )}
              <div>
                <span className="field-label">{t("outreach.status")}</span>
                <span className="muted small">
                  {t(`outreach.statuses.${c.outreach_status}`)}
                </span>
              </div>
              {c.last_contacted_at && (
                <span className="muted small">
                  {t("outreach.lastContacted")}: {formatDate(c.last_contacted_at)}
                </span>
              )}
              {c.follow_up_at && (
                <span
                  className={`small${isFollowUpOverdue(c) ? " warn-text" : isFollowUpDue(c) ? " warn-text" : ""}`}
                >
                  {t("outreach.followUpDue")}: {formatDate(c.follow_up_at)}
                </span>
              )}
              {c.notes && <p className="notes">{c.notes}</p>}
            </div>

            <div className="detail-actions">
              <button onClick={() => setEditing(true)}>{t("common.edit")}</button>
              <button
                className="danger"
                onClick={() => {
                  onDelete("contacts", c.id, c.name);
                  onClose();
                }}
              >
                {t("common.delete")}
              </button>
            </div>

            <h3 className="detail-sub">{t("detail.timeline")}</h3>
            <Timeline resource="contacts" targetId={c.id} onError={onError} />
          </>
        )}
      </div>
    </div>
  );
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonthYear(month: number | null, year: number | null): string {
  if (!year) return "";
  return month ? `${MONTH_NAMES[month - 1]} ${year}` : `${year}`;
}

function CVTab({
  onError,
  notify,
}: {
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workExp, setWorkExp] = useState<WorkExperience[] | null>(null);
  const [education, setEducation] = useState<Education[] | null>(null);
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [template, setTemplate] = useState<"single-column" | "two-column">(
    "single-column",
  );

  const load = useCallback(
    () =>
      Promise.all([
        api.profile().then(setProfile),
        api.list<WorkExperience>("work-experience").then(setWorkExp),
        api.list<Education>("education").then(setEducation),
        api.list<Language>("languages").then(setLanguages),
      ]).catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Live PDF preview (#134) — regenerates the actual PDF (not an
  // approximation) whenever the underlying data or template changes,
  // instead of edit-then-download-to-check. Overlaps with #95's template
  // thumbnails, which stay as the small selector; this is the full page.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!profile || !workExp || !education || !languages) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      const { generateCvPdf, generateCvPdfTwoColumn } = await import("./pdf");
      if (cancelled) return;
      const tCv = i18n.getFixedT(getCvLanguage(i18n.resolvedLanguage ?? "en"));
      const labels = {
        present: tCv("cv.present"),
        workExperience: tCv("cv.workExperience"),
        education: tCv("cv.education"),
        languages: tCv("cv.languages"),
        skills: tCv("cv.skills"),
      };
      const cvData = { profile, workExperience: workExp, education, languages };
      const doc =
        template === "two-column"
          ? generateCvPdfTwoColumn(cvData, labels)
          : generateCvPdf(cvData, labels);
      objectUrl = doc.output("bloburl") as unknown as string;
      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setPreviewUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile, workExp, education, languages, template, i18n]);

  if (!profile || !workExp || !education || !languages) {
    return <LoadingSkeleton />;
  }

  const downloadPdf = async () => {
    // Dynamic import — jsPDF (~400kB) is only needed once someone
    // actually downloads a CV, not on every page load.
    const { generateCvPdf, generateCvPdfTwoColumn } = await import("./pdf");
    const tCv = i18n.getFixedT(getCvLanguage(i18n.resolvedLanguage ?? "en"));
    const labels = {
      present: tCv("cv.present"),
      workExperience: tCv("cv.workExperience"),
      education: tCv("cv.education"),
      languages: tCv("cv.languages"),
      skills: tCv("cv.skills"),
    };
    const cvData = { profile, workExperience: workExp, education, languages };
    const doc =
      template === "two-column"
        ? generateCvPdfTwoColumn(cvData, labels)
        : generateCvPdf(cvData, labels);
    const filename = profile.name
      ? `${profile.name.replace(/\s+/g, "-")}-CV.pdf`
      : "CV.pdf";
    doc.save(filename);
  };

  return (
    <section className="cv-tab">
      <div className="cv-toolbar">
        <div className="cv-template-picker">
          <span className="cv-template-picker-label">{t("cv.template")}</span>
          <div className="cv-template-options">
            <button
              type="button"
              className={`cv-template-option${template === "single-column" ? " selected" : ""}`}
              aria-pressed={template === "single-column"}
              onClick={() => setTemplate("single-column")}
            >
              <span className="cv-template-thumb cv-template-thumb-single">
                <span className="cv-t-line" />
                <span className="cv-t-line" />
                <span className="cv-t-line short" />
              </span>
              {t("cv.templateSingle")}
            </button>
            <button
              type="button"
              className={`cv-template-option${template === "two-column" ? " selected" : ""}`}
              aria-pressed={template === "two-column"}
              onClick={() => setTemplate("two-column")}
            >
              <span className="cv-template-thumb cv-template-thumb-two-col">
                <span className="cv-t-col">
                  <span className="cv-t-line" />
                  <span className="cv-t-line short" />
                </span>
                <span className="cv-t-col wide">
                  <span className="cv-t-line" />
                  <span className="cv-t-line" />
                </span>
              </span>
              {t("cv.templateTwoColumn")}
            </button>
          </div>
        </div>
        <button className="primary" onClick={downloadPdf}>
          {t("cv.downloadPdf")}
        </button>
      </div>
      <div className="cv-layout">
        <div className="cv-main">
          <ProfileSection
            profile={profile}
            onChanged={load}
            onError={onError}
            notify={notify}
          />
          <WorkExperienceSection
            items={workExp}
            onChanged={load}
            onError={onError}
            notify={notify}
          />
          <EducationSection
            items={education}
            onChanged={load}
            onError={onError}
            notify={notify}
          />
          <LanguagesSection
            items={languages}
            onChanged={load}
            onError={onError}
            notify={notify}
          />
        </div>
        <aside className="jobs-side">
          <h3 className="side-h">{t("cv.completeness")}</h3>
          <ul className="side-list">
            <li>
              <span className="side-title">{t("cv.profile")}</span>
              <span className="side-co">
                {[profile.name, profile.email, profile.summary].filter(Boolean).length}/3
              </span>
            </li>
            <li>
              <span className="side-title">{t("cv.workExperience")}</span>
              <span className="side-co">{workExp.length}</span>
            </li>
            <li>
              <span className="side-title">{t("cv.education")}</span>
              <span className="side-co">{education.length}</span>
            </li>
            <li>
              <span className="side-title">{t("cv.languages")}</span>
              <span className="side-co">{languages.length}</span>
            </li>
          </ul>
          <h3 className="side-h cv-preview-h">{t("cv.livePreview")}</h3>
          {previewUrl ? (
            <iframe
              className="cv-preview-frame"
              src={previewUrl}
              title={t("cv.livePreview")}
            />
          ) : (
            <div className="skeleton-card cv-preview-frame" />
          )}
        </aside>
      </div>
    </section>
  );
}

function ProfileSection({
  profile,
  onChanged,
  onError,
  notify,
}: {
  profile: Profile;
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(profile);
  const set = (patch: Partial<Profile>) => setForm((f) => ({ ...f, ...patch }));

  const save = (e: FormEvent) => {
    e.preventDefault();
    api
      .updateProfile(form)
      .then(() => {
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  return (
    <form className="form" onSubmit={save}>
      <div className="form-group">
        <h4>{t("cv.profile")}</h4>
        <label>
          {t("cv.name")}
          <input value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          {t("cv.email")}
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => set({ email: e.target.value })}
          />
        </label>
        <label>
          {t("cv.phone")}
          <input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
        </label>
        <label>
          {t("cv.location")}
          <input
            value={form.location ?? ""}
            onChange={(e) => set({ location: e.target.value })}
          />
        </label>
        <label>
          {t("cv.linkedin")}
          <input
            type="url"
            value={form.linkedin ?? ""}
            onChange={(e) => set({ linkedin: e.target.value })}
          />
        </label>
        <label>
          {t("cv.github")}
          <input
            type="url"
            value={form.github ?? ""}
            onChange={(e) => set({ github: e.target.value })}
          />
        </label>
        <label>
          {t("cv.portfolio")}
          <input
            type="url"
            value={form.portfolio ?? ""}
            onChange={(e) => set({ portfolio: e.target.value })}
          />
        </label>
        <label className="full">
          {t("cv.summary")}
          <textarea
            rows={3}
            value={form.summary ?? ""}
            onChange={(e) => set({ summary: e.target.value })}
          />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="primary">
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}

function WorkExperienceForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: WorkExperience | null;
  onSubmit: (data: Partial<WorkExperience>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<WorkExperience>>(initial ?? {});
  const set = (patch: Partial<WorkExperience>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        {t("cv.company")} *
        <input
          required
          value={form.company ?? ""}
          onChange={(e) => set({ company: e.target.value })}
        />
      </label>
      <label>
        {t("cv.jobTitle")} *
        <input
          required
          value={form.title ?? ""}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <label>
        {t("cv.startMonth")}
        <input
          type="number"
          min={1}
          max={12}
          value={form.start_month ?? ""}
          onChange={(e) =>
            set({ start_month: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label>
        {t("cv.startYear")}
        <input
          type="number"
          value={form.start_year ?? ""}
          onChange={(e) =>
            set({ start_year: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!form.is_current}
          onChange={(e) => set({ is_current: e.target.checked ? 1 : 0 })}
        />
        {t("cv.current")}
      </label>
      {!form.is_current && (
        <>
          <label>
            {t("cv.endMonth")}
            <input
              type="number"
              min={1}
              max={12}
              value={form.end_month ?? ""}
              onChange={(e) =>
                set({ end_month: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
          <label>
            {t("cv.endYear")}
            <input
              type="number"
              value={form.end_year ?? ""}
              onChange={(e) =>
                set({ end_year: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
        </>
      )}
      <label className="full">
        {t("cv.description")}
        <textarea
          rows={3}
          value={form.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary">
          {t("common.save")}
        </button>
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function WorkExperienceSection({
  items,
  onChanged,
  onError,
  notify,
}: {
  items: WorkExperience[];
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<WorkExperience | "new" | null>(null);
  const [newSkill, setNewSkill] = useState<Record<number, string>>({});

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  const addSkill = (workExperienceId: number) => {
    const name = (newSkill[workExperienceId] ?? "").trim();
    if (!name) return;
    api
      .addWorkExperienceSkill(workExperienceId, name)
      .then(() => {
        setNewSkill((m) => ({ ...m, [workExperienceId]: "" }));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  const move = (index: number, dir: -1 | 1) => {
    const other = items[index + dir];
    const item = items[index];
    if (!other) return;
    Promise.all([
      api.update("work-experience", item.id, { ...item, sort_order: other.sort_order }),
      api.update("work-experience", other.id, { ...other, sort_order: item.sort_order }),
    ])
      .then(onChanged)
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="cv-section">
      <h3 className="detail-sub">{t("cv.workExperience")}</h3>
      <ul className="cv-list">
        {items.map((w, i) => (
          <li key={w.id} className="cv-item">
            <div className="cv-item-head">
              <div>
                <strong>{w.title}</strong> — {w.company}
                <div className="muted small">
                  {formatMonthYear(w.start_month, w.start_year)} –{" "}
                  {w.is_current
                    ? t("cv.present")
                    : formatMonthYear(w.end_month, w.end_year)}
                </div>
              </div>
              <div className="cv-item-actions">
                <button
                  aria-label={t("cv.moveUp")}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={t("cv.moveDown")}
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button onClick={() => setEditing(w)}>{t("common.edit")}</button>
                <button
                  className="danger"
                  onClick={() =>
                    api
                      .remove("work-experience", w.id)
                      .then(onChanged)
                      .catch((e) => onError((e as Error).message))
                  }
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
            {w.description && <p className="notes">{w.description}</p>}
            <div className="keyword-chips">
              {w.skills.map((s) => (
                <span key={s.id} className="chip">
                  {s.name}
                  <button
                    onClick={() =>
                      api
                        .removeWorkExperienceSkill(w.id, s.id)
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
                placeholder={t("cv.addSkill")}
                value={newSkill[w.id] ?? ""}
                onChange={(e) =>
                  setNewSkill((m) => ({ ...m, [w.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill(w.id);
                  }
                }}
              />
            </div>
            {editing !== "new" && editing?.id === w.id && (
              <WorkExperienceForm
                initial={editing}
                onCancel={() => setEditing(null)}
                onSubmit={(data) =>
                  run(() => api.update("work-experience", w.id, data))
                }
              />
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li className="empty">
            <EmptyCvIcon />
            {t("cv.noWorkExperience")}
          </li>
        )}
      </ul>
      {editing === "new" ? (
        <WorkExperienceForm
          initial={null}
          onCancel={() => setEditing(null)}
          onSubmit={(data) => run(() => api.create("work-experience", data))}
        />
      ) : (
        <button className="primary" onClick={() => setEditing("new")}>
          {t("cv.addWorkExperience")}
        </button>
      )}
    </div>
  );
}

function EducationForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Education | null;
  onSubmit: (data: Partial<Education>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Education>>(initial ?? {});
  const set = (patch: Partial<Education>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        {t("cv.institution")} *
        <input
          required
          value={form.institution ?? ""}
          onChange={(e) => set({ institution: e.target.value })}
        />
      </label>
      <label>
        {t("cv.degree")}
        <input
          value={form.degree ?? ""}
          onChange={(e) => set({ degree: e.target.value })}
        />
      </label>
      <label>
        {t("cv.field")}
        <input
          value={form.field ?? ""}
          onChange={(e) => set({ field: e.target.value })}
        />
      </label>
      <label>
        {t("cv.startYear")}
        <input
          type="number"
          value={form.start_year ?? ""}
          onChange={(e) =>
            set({ start_year: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label>
        {t("cv.endYear")}
        <input
          type="number"
          value={form.end_year ?? ""}
          onChange={(e) =>
            set({ end_year: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary">
          {t("common.save")}
        </button>
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

function EducationSection({
  items,
  onChanged,
  onError,
  notify,
}: {
  items: Education[];
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Education | "new" | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setEditing(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));

  const move = (index: number, dir: -1 | 1) => {
    const other = items[index + dir];
    const item = items[index];
    if (!other) return;
    Promise.all([
      api.update("education", item.id, { ...item, sort_order: other.sort_order }),
      api.update("education", other.id, { ...other, sort_order: item.sort_order }),
    ])
      .then(onChanged)
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="cv-section">
      <h3 className="detail-sub">{t("cv.education")}</h3>
      <ul className="cv-list">
        {items.map((ed, i) => (
          <li key={ed.id} className="cv-item">
            <div className="cv-item-head">
              <div>
                <strong>{ed.institution}</strong>
                {ed.degree ? ` — ${ed.degree}` : ""}
                {ed.field ? ` (${ed.field})` : ""}
                <div className="muted small">
                  {formatMonthYear(ed.start_month, ed.start_year)} –{" "}
                  {formatMonthYear(ed.end_month, ed.end_year)}
                </div>
              </div>
              <div className="cv-item-actions">
                <button
                  aria-label={t("cv.moveUp")}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={t("cv.moveDown")}
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button onClick={() => setEditing(ed)}>{t("common.edit")}</button>
                <button
                  className="danger"
                  onClick={() =>
                    api
                      .remove("education", ed.id)
                      .then(onChanged)
                      .catch((e) => onError((e as Error).message))
                  }
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
            {editing !== "new" && editing?.id === ed.id && (
              <EducationForm
                initial={editing}
                onCancel={() => setEditing(null)}
                onSubmit={(data) => run(() => api.update("education", ed.id, data))}
              />
            )}
          </li>
        ))}
        {items.length === 0 && <li className="empty">{t("cv.noEducation")}</li>}
      </ul>
      {editing === "new" ? (
        <EducationForm
          initial={null}
          onCancel={() => setEditing(null)}
          onSubmit={(data) => run(() => api.create("education", data))}
        />
      ) : (
        <button className="primary" onClick={() => setEditing("new")}>
          {t("cv.addEducation")}
        </button>
      )}
    </div>
  );
}

function LanguagesSection({
  items,
  onChanged,
  onError,
  notify,
}: {
  items: Language[];
  onChanged: () => Promise<unknown>;
  onError: (message: string | null) => void;
  notify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [proficiency, setProficiency] =
    useState<Language["proficiency"]>("conversational");

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    api
      .create("languages", { name: name.trim(), proficiency })
      .then(() => {
        setName("");
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="cv-section">
      <h3 className="detail-sub">{t("cv.languages")}</h3>
      <ul className="settings-list">
        {items.map((l) => (
          <li key={l.id}>
            <span>
              {l.name} — {t(`cv.proficiency.${l.proficiency}`)}
            </span>
            <button
              className="danger"
              onClick={() =>
                api
                  .remove("languages", l.id)
                  .then(onChanged)
                  .catch((e) => onError((e as Error).message))
              }
            >
              <RemoveIcon />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="empty">{t("cv.noLanguages")}</li>}
      </ul>
      <form className="settings-add" onSubmit={add}>
        <input
          placeholder={t("cv.languageName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          value={proficiency}
          onChange={(e) =>
            setProficiency(e.target.value as Language["proficiency"])
          }
        >
          <option value="conversational">{t("cv.proficiency.conversational")}</option>
          <option value="fluent">{t("cv.proficiency.fluent")}</option>
          <option value="native">{t("cv.proficiency.native")}</option>
        </select>
        <button type="submit" className="primary">
          {t("feedSettings.add")}
        </button>
      </form>
    </div>
  );
}
