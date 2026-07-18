import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { authClient, signOut, useSession } from "./auth-client";
import {
  funnelConversions,
  responseRate,
  medianTimeInStageDays,
} from "./stats";
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
  type FeedCursor,
  type SavedView,
  type JobFilters,
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
  type JournalEntry,
  type AppNotification,
  type AtsBoard,
  type Webhook,
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

// Guards an async submit against double-fire (#261) and exposes a busy
// flag for disabling the button. The wrapped handler already returns a
// promise (the api chain), so we just await it and reset when it settles.
function useSubmitGuard<T>(onSubmit: (value: T) => void | Promise<void>) {
  const [submitting, setSubmitting] = useState(false);
  const submit = async (value: T) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(value);
    } finally {
      setSubmitting(false);
    }
  };
  return [submitting, submit] as const;
}

// Makes a non-button clickable row keyboard-operable (#261): announces as
// a button and fires the same action on Enter/Space. Spread onto the
// element that carries the row's onClick.
function rowActivate(onActivate: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  } as const;
}

// Dialog focus management (#261) — moves focus into the dialog on open and
// traps Tab within it, so keyboard/AT users can't tab out to the page
// behind the modal. Attach the returned ref to the dialog element.
function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const selector =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null,
      );
    // Remember where focus came from — closing a dialog must return the
    // keyboard user to their place, not drop them at <body> (#346).
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusable();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [active]);
  return ref;
}

// Shared dialog primitive (#314) — backdrop, focus trap, Escape, and
// aria-modal in one place instead of re-implemented per modal.
function Dialog({
  label,
  onClose,
  className,
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useFocusTrap<HTMLDivElement>();
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
        ref={ref}
        className={`modal${className ? ` ${className}` : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

// Terminal error state for a tab whose data fetch failed (#261). Without
// it, a failed load left the "Loading…" placeholder up forever while the
// only signal was the easy-to-miss top banner.
function LoadFailed({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="load-error" role="alert">
      <p className="muted small">{t("common.loadError")}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

// Stage-spectrum legend (#279) — teaches the pipeline colors, which are
// otherwise only implicit. The dot color comes from each stage-* class via
// --sc, the same token the board/stats dots use.
function StageLegend() {
  const { t } = useTranslation();
  return (
    <div className="stage-legend">
      {PIPELINE.map((s) => (
        <span key={s} className={`stage-legend-item stage-${s}`}>
          <span className="stat-dot" aria-hidden="true" />
          {t(`stages.${s}`)}
        </span>
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

function EmptyFeedIcon() {
  // Radar sweep — the feed scans outside sources for new roles.
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M20 78 A46 46 0 0 1 66 32" strokeWidth="4" opacity="0.28" strokeLinecap="round" />
      <path d="M20 78 A32 32 0 0 1 52 46" strokeWidth="4" opacity="0.5" strokeLinecap="round" />
      <path d="M20 78 A18 18 0 0 1 38 60" strokeWidth="5" className="accent-stroke" strokeLinecap="round" />
      <circle cx="66" cy="32" r="6" strokeWidth="5" className="accent-stroke" />
      <circle cx="20" cy="78" r="4" fill="currentColor" stroke="none" opacity="0.5" />
    </svg>
  );
}

function EmptyCalendarIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="16" y="22" width="64" height="56" rx="5" strokeWidth="4" opacity="0.3" />
      <line x1="16" y1="38" x2="80" y2="38" strokeWidth="4" opacity="0.3" />
      <line x1="34" y1="13" x2="34" y2="26" strokeWidth="4" opacity="0.5" strokeLinecap="round" />
      <line x1="62" y1="13" x2="62" y2="26" strokeWidth="4" opacity="0.5" strokeLinecap="round" />
      <circle cx="59" cy="58" r="9" strokeWidth="5" className="accent-stroke" />
    </svg>
  );
}

function EmptyActivityIcon() {
  // Pulse line — events land here once things start moving.
  return (
    <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M10 56 h16 l7-16" strokeWidth="4" opacity="0.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M33 40 44 72 54 44" strokeWidth="5" className="accent-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M54 44 l5 12 h27" strokeWidth="4" opacity="0.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Matches the stroke-based hand-drawn style of the Empty*Icon set (#203) —
// the settings button previously used a bare "⚙" glyph, a third icon
// convention alongside these SVGs and the app's mostly-textual chrome.
function SearchIcon() {
  return (
    <svg
      className="settings-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" strokeWidth="2" />
      <path d="M20 20l-5-5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      className="settings-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" strokeWidth="2" />
      <path
        d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.66 6.34l-1.7 1.7M8.04 15.96l-1.7 1.7M17.66 17.66l-1.7-1.7M8.04 8.04l-1.7-1.7"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Matches the stroke-based hand-drawn style of the Empty*Icon set —
// the error banner previously had no icon at all (#206).
function ErrorIcon() {
  return (
    <svg
      className="error-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      <line x1="12" y1="7.5" x2="12" y2="13" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="bell-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 13.5 6 9Z"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" strokeWidth="2" strokeLinecap="round" />
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
  // /activity folded into Overview (#285); old links land on Overview.
  activity: "overview",
  stats: "stats",
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

// One styled confirmation dialog for the whole app (#314 round 3) —
// replaces the browser's window.confirm, which ignored the design system,
// the themes, and the focus-trap conventions. requestConfirm resolves like
// confirm() does, so call sites stay a one-line guard. The module-level
// indirection exists so deeply nested settings sections don't all need a
// prop threaded through; ConfirmHost (rendered once at the App root)
// installs the real implementation.
let requestConfirm: (message: string) => Promise<boolean> = (message) =>
  Promise.resolve(window.confirm(message));

function ConfirmHost() {
  const { t } = useTranslation();
  const [req, setReq] = useState<{
    message: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  useEffect(() => {
    requestConfirm = (message) =>
      new Promise((resolve) =>
        setReq((prev) => {
          // A second confirm may fire while one is pending (#346); the
          // replaced caller must resolve (as "cancelled"), not hang forever.
          prev?.resolve(false);
          return { message, resolve };
        }),
      );
    return () => {
      requestConfirm = (message) => Promise.resolve(window.confirm(message));
    };
  }, []);
  const answer = (ok: boolean) => {
    setReq((cur) => {
      cur?.resolve(ok);
      return null;
    });
  };
  // Capture-phase Escape: the dialog may sit on top of another modal whose
  // own window-level Escape listener would otherwise close both at once.
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        answer(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [req]);
  if (!req) return null;
  return (
    <Dialog
      label={req.message}
      onClose={() => answer(false)}
      className="confirm-dialog"
    >
      <p>{req.message}</p>
      <div className="form-actions">
        <button className="danger" onClick={() => answer(true)}>
          {t("common.confirm")}
        </button>
        <button type="button" onClick={() => answer(false)}>
          {t("common.cancel")}
        </button>
      </div>
    </Dialog>
  );
}

const SHORTCUT_KEYS: [string, string][] = [
  ["n", "addJob"],
  ["/", "focusSearch"],
  ["⌘ / Ctrl K", "palette"],
  ["j / k", "feedMove"],
  ["a / d", "feedTriage"],
  ["Esc", "closeHelp"],
];

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog label={t("shortcuts.title")} onClose={onClose} className="shortcut-help">
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
    </Dialog>
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
function DeleteAccount({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (!(await requestConfirm(t("account.deleteConfirm")))) return;
    setBusy(true);
    try {
      await api.deleteAccount();
      await signOut();
      window.location.reload();
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="admin-invite">
      <h3>{t("account.deleteAccount")}</h3>
      <p className="muted small">{t("account.deleteHint")}</p>
      <button className="danger" disabled={busy} onClick={del}>
        {t("account.deleteAccount")}
      </button>
    </div>
  );
}

// Self-serve change-password (#285) — closes the "invited users are stuck
// on the admin's temporary password, with no way to change it" gap.
function ChangePassword() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: t("account.changePasswordError") });
      return;
    }
    setMsg({ ok: true, text: t("account.changePasswordSuccess") });
    setCurrent("");
    setNext("");
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.changePassword")}</h3>
      <form onSubmit={submit}>
        <label className="settings-field">
          <span>{t("account.currentPassword")}</span>
          <input
            type="password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="settings-field">
          <span>{t("account.newPassword")}</span>
          <input
            type="password"
            required
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        {msg && (
          <p className={msg.ok ? "admin-invite-success" : "login-error"}>
            {msg.text}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {t("account.changePasswordSubmit")}
        </button>
      </form>
    </div>
  );
}

// Admin user management (#285) — the recovery path for a locked-out user:
// list users, reset a forgotten password to a new temporary one, reset a
// lost 2FA, or remove an account. Without this, recovery meant editing D1
// by hand.
type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  twoFactorEnabled: boolean | null;
};
function AdminUsers({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authClient.admin.listUsers({ query: { limit: 100 } });
    if (res.error) {
      onError(t("account.usersLoadError"));
      return;
    }
    // twoFactorEnabled is a real user column but not in the client's typed
    // UserWithRole, so widen through unknown.
    setUsers((res.data?.users ?? []) as unknown as AdminUser[]);
  }, [onError, t]);

  useEffect(() => {
    load();
  }, [load]);

  const resetPassword = async (u: AdminUser) => {
    // A one-off temporary password the admin relays; the user changes it
    // themselves via ChangePassword after logging in. 128 bits of entropy
    // (#285 security review) — a truncated UUID was far too guessable.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const temp =
      "Reset-" +
      Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await authClient.admin.setUserPassword({
      userId: u.id,
      newPassword: temp,
    });
    if (error) {
      onError(t("account.resetPasswordError"));
      return;
    }
    setNotice(t("account.tempPasswordSet", { email: u.email, password: temp }));
  };

  const reset2fa = (u: AdminUser) =>
    api
      .resetUser2fa(u.id)
      .then(() => {
        setNotice(t("account.twoFactorReset", { email: u.email }));
        return load();
      })
      .catch((e) => onError((e as Error).message));

  const remove = async (u: AdminUser) => {
    if (
      !(await requestConfirm(
        t("account.removeUserConfirm", { email: u.email }),
      ))
    )
      return;
    const { error } = await authClient.admin.removeUser({ userId: u.id });
    if (error) {
      onError(t("account.removeUserError"));
      return;
    }
    return load();
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.manageUsers")}</h3>
      {notice && <p className="admin-invite-success">{notice}</p>}
      <ul className="settings-list">
        {(users ?? []).map((u) => (
          <li key={u.id} className="admin-user">
            <span className="admin-user-id">
              {u.name ?? u.email}
              <span className="muted small"> · {u.email}</span>
              {u.twoFactorEnabled ? (
                <span className="badge"> 2FA</span>
              ) : null}
            </span>
            {u.id !== session?.user.id && (
              <span className="admin-user-actions">
                <button onClick={() => resetPassword(u)}>
                  {t("account.resetPassword")}
                </button>
                {u.twoFactorEnabled ? (
                  <button onClick={() => reset2fa(u)}>
                    {t("account.reset2fa")}
                  </button>
                ) : null}
                <button className="danger" onClick={() => remove(u)}>
                  {t("account.removeUser")}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
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

// Per-user sample data (#281) — a new/invited user can fill an empty
// account with the example dataset to explore, then wipe it in one click.
// A full reload after either action is the simplest way to refresh every
// tab's data at once.
function SampleDataSettings({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{
    loaded: boolean;
    hasData: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .sampleDataStatus()
      .then(setStatus)
      .catch((e) => onError((e as Error).message));
  }, [onError]);

  if (!status) return null;
  // Nothing to offer once the account has real (non-sample) data.
  if (status.hasData && !status.loaded) return null;

  const load = () => {
    setBusy(true);
    api
      .loadSampleData()
      .then(() => window.location.reload())
      .catch((e) => {
        onError((e as Error).message);
        setBusy(false);
      });
  };
  const clear = async () => {
    if (!(await requestConfirm(t("sampleData.clearConfirm")))) return;
    setBusy(true);
    api
      .clearSampleData()
      .then(() => window.location.reload())
      .catch((e) => {
        onError((e as Error).message);
        setBusy(false);
      });
  };

  return (
    <div className="sample-data">
      <h3>{t("sampleData.title")}</h3>
      {status.loaded ? (
        <>
          <p className="muted small">{t("sampleData.loadedHint")}</p>
          <button disabled={busy} onClick={clear}>
            {t("sampleData.clear")}
          </button>
        </>
      ) : (
        <>
          <p className="muted small">{t("sampleData.emptyHint")}</p>
          <button disabled={busy} onClick={load}>
            {t("sampleData.load")}
          </button>
        </>
      )}
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
    try {
      const res = await fetch("/api/admin/reset-demo-data", { method: "POST" });
      setMessage(
        res.ok ? t("account.resetDemoSuccess") : t("account.resetDemoError"),
      );
    } catch {
      setMessage(t("account.resetDemoError"));
    } finally {
      setBusy(false);
    }
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

// Public API key + webhooks (#228) — the key is shown in full whenever
// it exists (unlike a password) since it's meant to be copied into
// another tool's config; a webhook's signing secret, by contrast, is
// only ever shown once at creation (see addWebhook below), same as the
// 2FA backup codes.
function PublicApiSettings({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);

  const loadWebhooks = useCallback(
    () =>
      api
        .webhooks()
        .then(setWebhooks)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    api.profile().then((p) => setApiKey(p.api_key));
    loadWebhooks();
  }, [loadWebhooks]);

  const generateKey = async () => {
    // Regenerating (a key already exists) invalidates the current one, so
    // warn — but the first-time generate has nothing to break (#285).
    if (apiKey && !(await requestConfirm(t("account.regenerateKeyConfirm"))))
      return;
    setKeyBusy(true);
    api
      .generateApiKey()
      .then((r) => setApiKey(r.api_key))
      .catch((e) => onError((e as Error).message))
      .finally(() => setKeyBusy(false));
  };

  const revokeKey = async () => {
    if (!(await requestConfirm(t("account.revokeKeyConfirm")))) return;
    setKeyBusy(true);
    api
      .revokeApiKey()
      .then(() => setApiKey(null))
      .catch((e) => onError((e as Error).message))
      .finally(() => setKeyBusy(false));
  };

  const addWebhook = (e: FormEvent) => {
    e.preventDefault();
    const url = newWebhookUrl.trim();
    if (!url) return;
    setWebhookBusy(true);
    api
      .addWebhook(url)
      .then((r) => {
        setNewWebhookUrl("");
        setNewWebhookSecret(r.secret);
        return loadWebhooks();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setWebhookBusy(false));
  };

  const removeWebhook = (id: number) => {
    api
      .removeWebhook(id)
      .then(loadWebhooks)
      .catch((e) => onError((e as Error).message));
  };

  return (
    <div className="admin-invite">
      <h3>{t("account.apiKey")}</h3>
      <p className="muted small">{t("account.apiKeyHint")}</p>
      {apiKey ? (
        <>
          <input readOnly value={apiKey} onClick={(e) => (e.target as HTMLInputElement).select()} />
          <div className="share-actions">
            <button disabled={keyBusy} onClick={generateKey}>
              {t("settings.regenerateLink")}
            </button>
            <button disabled={keyBusy} className="danger" onClick={revokeKey}>
              {t("settings.disableLink")}
            </button>
          </div>
        </>
      ) : (
        <button disabled={keyBusy} onClick={generateKey}>
          {t("account.apiKeyGenerate")}
        </button>
      )}

      <h3>{t("account.webhooks")}</h3>
      <p className="muted small">{t("account.webhooksHint")}</p>
      {newWebhookSecret && (
        <p className="tfa-secret">
          {t("account.webhookSecretHint")}
          <br />
          {newWebhookSecret}
        </p>
      )}
      <ul className="settings-list">
        {(webhooks ?? []).map((w) => (
          <li key={w.id}>
            <span>
              {w.url}
              {!w.enabled ? (
                <span className="muted small warn-text">
                  {" "}
                  · {t("account.webhookDisabled")}
                </span>
              ) : w.last_status === "failed" ? (
                <span className="muted small warn-text">
                  {" "}
                  · {t("account.webhookFailing", { count: w.failure_count })}
                </span>
              ) : w.last_status === "ok" ? (
                <span className="muted small">
                  {" "}
                  · {t("account.webhookOk")}
                </span>
              ) : null}
            </span>
            <button className="danger" onClick={() => removeWebhook(w.id)}>
              <RemoveIcon />
            </button>
          </li>
        ))}
      </ul>
      <form className="settings-add" onSubmit={addWebhook}>
        <input
          type="url"
          placeholder="https://example.com/webhook"
          value={newWebhookUrl}
          onChange={(e) => setNewWebhookUrl(e.target.value)}
        />
        <button type="submit" className="primary" disabled={webhookBusy}>
          {t("feedSettings.add")}
        </button>
      </form>

      <ApiDocs />
    </div>
  );
}

// API reference (#283) — documents the read-only v1 API and webhooks right
// where the key and hooks are managed. The base URL is derived from the
// current origin so it's correct on any deployment.
function ApiDocs() {
  const { t } = useTranslation();
  const base = `${window.location.origin}/api/v1`;
  return (
    <details className="api-docs">
      <summary>{t("apiDocs.title")}</summary>
      <p className="muted small">{t("apiDocs.intro")}</p>
      <pre>
        <code>{base}</code>
      </pre>

      <h4>{t("apiDocs.authHeading")}</h4>
      <p className="muted small">{t("apiDocs.auth")}</p>
      <pre>
        <code>Authorization: Bearer YOUR_API_KEY</code>
      </pre>

      <h4>{t("apiDocs.endpointsHeading")}</h4>
      <ul className="api-endpoints">
        <li>
          <code>GET /applications</code>
          <span className="muted small">{t("apiDocs.listDesc")}</span>
        </li>
        <li>
          <code>GET /applications/:id</code>
          <span className="muted small">{t("apiDocs.getDesc")}</span>
        </li>
      </ul>
      <p className="muted small">{t("apiDocs.fieldsNote")}</p>

      <h4>{t("apiDocs.exampleHeading")}</h4>
      <pre>
        <code>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  ${base}/applications`}</code>
      </pre>

      <h4>{t("apiDocs.webhooksHeading")}</h4>
      <p className="muted small">{t("apiDocs.webhookIntro")}</p>
      <pre>
        <code>{`{
  "event": "application.status_changed",
  "data": {
    "application_id": 42,
    "from_status": "screening",
    "to_status": "interview"
  },
  "sent_at": "2026-07-17T12:00:00.000Z"
}`}</code>
      </pre>
      <p className="muted small">{t("apiDocs.signatureNote")}</p>
      <pre>
        <code>{`import crypto from "node:crypto";
const expected = crypto
  .createHmac("sha256", WEBHOOK_SECRET)
  .update(rawRequestBody)
  .digest("hex");
// timing-safe compare expected === X-JobSeekr-Signature`}</code>
      </pre>
    </details>
  );
}

// Web Push (#214) — base64url VAPID public key -> the raw byte array
// PushManager.subscribe() needs, per the standard applicationServerKey
// conversion (browsers don't accept the base64url string directly).
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function PushSettings() {
  const { t } = useTranslation();
  const [supported] = useState(
    () => "serviceWorker" in navigator && "PushManager" in window,
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false));
  }, [supported]);

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const { publicKey } = await api.pushPublicKey();
      if (!publicKey) {
        setError(t("account.pushNotConfigured"));
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api.pushSubscribe(sub.toJSON() as PushSubscriptionJSON);
      setSubscribed(true);
    } catch {
      setError(t("account.pushError"));
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.pushUnsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError(t("account.pushError"));
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return null;

  return (
    <div className="admin-invite">
      <h3>{t("account.push")}</h3>
      <p className="muted small">
        {subscribed ? t("account.pushEnabledHint") : t("account.pushDisabledHint")}
      </p>
      {error && <p className="login-error">{error}</p>}
      <button disabled={busy || subscribed == null} onClick={subscribed ? unsubscribe : subscribe}>
        {subscribed ? t("account.pushDisable") : t("account.pushEnable")}
      </button>
    </div>
  );
}

// TOTP-based 2FA setup (#211) — no QR image (no new dependency for
// one settings field); the otpauth:// URI and its embedded secret are
// both shown so any authenticator app can add it, by scan-free manual
// entry if needed. Enabling immediately turns 2FA on server-side; the
// code-verify step here is just a "does this actually work" check.
function TwoFactorSettings() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const enabled = !!(session?.user as { twoFactorEnabled?: boolean } | undefined)
    ?.twoFactorEnabled;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(
    null,
  );
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const enable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: enableError } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (enableError || !data) {
      setError(t("account.twoFactorError"));
      return;
    }
    setSetup(data);
    setPassword("");
  };

  const disable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: disableError } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (disableError) {
      setError(t("account.twoFactorError"));
      return;
    }
    setPassword("");
    setSetup(null);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({
      code: verifyCode,
    });
    setBusy(false);
    setVerifyMessage(
      verifyError ? t("account.twoFactorVerifyError") : t("account.twoFactorVerified"),
    );
  };

  const secret = setup ? new URL(setup.totpURI).searchParams.get("secret") : null;

  return (
    <div className="admin-invite">
      <h3>{t("account.twoFactor")}</h3>
      {setup ? (
        <>
          <p className="muted small">{t("account.twoFactorScanHint")}</p>
          <p className="tfa-secret">{secret}</p>
          <p className="muted small">{t("account.twoFactorBackupCodesHint")}</p>
          <ul className="tfa-backup-codes">
            {setup.backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              // Backup codes are shown once (#285) — let the user save them.
              const blob = new Blob(
                [setup.backupCodes.join("\n") + "\n"],
                { type: "text/plain" },
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "jobseekr-backup-codes.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t("account.twoFactorDownloadCodes")}
          </button>
          <form onSubmit={verify} className="tfa-verify">
            <input
              placeholder={t("account.twoFactorCodePlaceholder")}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              {t("login.verify")}
            </button>
          </form>
          {verifyMessage && <p className="muted small">{verifyMessage}</p>}
          <button onClick={() => setSetup(null)}>{t("common.close")}</button>
        </>
      ) : (
        <form onSubmit={enabled ? disable : enable}>
          <p className="muted small">
            {enabled ? t("account.twoFactorEnabledHint") : t("account.twoFactorDisabledHint")}
          </p>
          <label className="settings-field">
            <span>{t("login.password")}</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={busy} className={enabled ? "danger" : ""}>
            {enabled ? t("account.twoFactorDisable") : t("account.twoFactorEnable")}
          </button>
        </form>
      )}
    </div>
  );
}

// Active session list + revoke (#212) — Better-Auth's core session
// endpoints (list/revoke/revoke-other), not a plugin, so no schema
// change needed. currentToken comes from useSession() so the current
// device's row can be marked and can't accidentally revoke itself via
// the "sign out other devices" bulk action.
function SessionManagement() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [sessions, setSessions] = useState<
    { token: string; ipAddress?: string | null; userAgent?: string | null; createdAt: string | Date }[]
    | null
  >(null);
  const [busyToken, setBusyToken] = useState<string | null>(null);

  const load = () => {
    authClient.listSessions().then(({ data }) => {
      if (data) setSessions(data);
    });
  };

  useEffect(load, []);

  const revoke = async (token: string) => {
    setBusyToken(token);
    await authClient.revokeSession({ token });
    setBusyToken(null);
    load();
  };

  const revokeOthers = async () => {
    setBusyToken("__others__");
    await authClient.revokeOtherSessions();
    setBusyToken(null);
    load();
  };

  if (!sessions) return null;

  const currentToken = session?.session.token;

  return (
    <div className="admin-invite">
      <h3>{t("account.sessions")}</h3>
      <ul className="session-list">
        {sessions.map((s) => (
          <li key={s.token} className={s.token === currentToken ? "current" : ""}>
            <span className="session-info">
              <span>{s.userAgent ?? t("account.unknownDevice")}</span>
              <span className="muted small">
                {s.ipAddress ?? "—"} · {formatDate(String(s.createdAt))}
                {s.token === currentToken ? ` · ${t("account.thisDevice")}` : ""}
              </span>
            </span>
            {s.token !== currentToken && (
              <button
                className="danger"
                disabled={busyToken === s.token}
                onClick={() => revoke(s.token)}
              >
                {t("account.revoke")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <button disabled={busyToken === "__others__"} onClick={revokeOthers}>
          {t("account.revokeOthers")}
        </button>
      )}
    </div>
  );
}

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

// Applies the persisted theme choice — called on initial load (see App())
// and whenever the Settings selector changes it.
function applyTheme(value: string) {
  if (value === "control-room") {
    document.documentElement.dataset.theme = "control-room";
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
    () => localStorage.getItem(THEME_KEY) ?? "auto",
  );
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

// Weekly application goal (#224) — a personal target next to the
// momentum streak. Persisted client-side like the density/theme
// toggles elsewhere in this app, since it's a display preference, not
// data that needs to sync across devices or show up in exports.
const WEEKLY_GOAL_KEY = "jobseekr_weekly_goal";

function WeeklyGoal({ thisWeekCount }: { thisWeekCount: number }) {
  const { t } = useTranslation();
  const [goal, setGoal] = useState(() =>
    Number(localStorage.getItem(WEEKLY_GOAL_KEY) ?? 5),
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goal));

  const save = () => {
    const n = Math.max(1, Math.round(Number(draft)) || goal);
    setGoal(n);
    localStorage.setItem(WEEKLY_GOAL_KEY, String(n));
    setEditing(false);
  };

  const pct = Math.min(100, Math.round((thisWeekCount / goal) * 100));
  const met = thisWeekCount >= goal;

  return (
    <div className={`weekly-goal${met ? " met" : ""}`}>
      <span className="weekly-goal-label">
        {t("stats.weeklyGoal.progress", { count: thisWeekCount, goal })}
      </span>
      <span className="htrack">
        <span
          className="hfill accent-fill"
          style={{ width: `${pct}%`, display: "block" }}
        />
      </span>
      {editing ? (
        <span className="weekly-goal-edit">
          <input
            type="number"
            min={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            autoFocus
          />
          <button className="primary" onClick={save}>
            {t("common.save")}
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="btn-secondary weekly-goal-btn"
          onClick={() => {
            setDraft(String(goal));
            setEditing(true);
          }}
        >
          {t("stats.weeklyGoal.edit")}
        </button>
      )}
    </div>
  );
}

// Milestone/wins journal (#225) — a personal log of small wins (good
// feedback, a strong interview, a callback) that don't necessarily map
// to a pipeline status change worth recording on an application.
function WinsJournal({
  onError,
}: {
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(
    () =>
      api
        .list<JournalEntry>("journal-entries")
        .then(setEntries)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    api
      .create("journal-entries", { text: trimmed })
      .then(() => {
        setText("");
        return load();
      })
      .catch((err) => onError((err as Error).message));
  };

  const remove = (id: number) =>
    api
      .remove("journal-entries", id)
      .then(load)
      .catch((e) => onError((e as Error).message));

  if (!entries) return null;

  const visible = expanded ? entries : entries.slice(0, 3);

  return (
    <div className="wins-journal">
      <h2 className="stat-h">{t("stats.journal.title")}</h2>
      <form className="tl-add" onSubmit={add}>
        <input
          placeholder={t("stats.journal.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="primary">
          {t("stats.journal.add")}
        </button>
      </form>
      {entries.length === 0 ? (
        <p className="muted small">{t("stats.journal.empty")}</p>
      ) : (
        <>
          <ul className="tl-items">
            {visible.map((entry) => (
              <li key={entry.id}>
                <span className="tl-date">{formatDate(entry.created_at)}</span>
                <span className="tl-notes">{entry.text}</span>
                <button
                  className="tl-del danger"
                  aria-label={t("common.delete")}
                  onClick={() => remove(entry.id)}
                >
                  <RemoveIcon />
                </button>
              </li>
            ))}
          </ul>
          {entries.length > 3 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? t("stats.journal.showLess")
                : t("stats.journal.showAll", { count: entries.length })}
            </button>
          )}
        </>
      )}
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
      } else if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
    const id = Date.now();
    setToast({ id, message, undo, label });
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
          <Logo />
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
          {t("tabs.overview")}
        </button>
        <button
          className={tab === "applications" || tab === "board" ? "active" : ""}
          aria-current={tab === "applications" || tab === "board" ? "page" : undefined}
          data-tab="pipeline"
          onClick={() => setTab("board")}
        >
          {t("tabs.pipeline")}
        </button>
        <button
          className={tab === "feed" ? "active" : ""}
          aria-current={tab === "feed" ? "page" : undefined}
          data-tab="feed"
          onClick={() => setTab("feed")}
        >
          {t("tabs.feed")}
        </button>
        <button
          className={tab === "calendar" ? "active" : ""}
          aria-current={tab === "calendar" ? "page" : undefined}
          data-tab="calendar"
          onClick={() => setTab("calendar")}
        >
          {t("tabs.calendar")}
        </button>
        <button
          className={tab === "stats" ? "active" : ""}
          aria-current={tab === "stats" ? "page" : undefined}
          data-tab="stats"
          onClick={() => setTab("stats")}
        >
          {t("tabs.stats")}
        </button>
        <button
          className={tab === "companies" || tab === "contacts" ? "active" : ""}
          aria-current={tab === "companies" || tab === "contacts" ? "page" : undefined}
          data-tab="network"
          onClick={() => setTab("companies")}
        >
          {t("tabs.network")}
        </button>
        <button
          className={tab === "cv" ? "active" : ""}
          aria-current={tab === "cv" ? "page" : undefined}
          data-tab="cv"
          onClick={() => setTab("cv")}
        >
          {t("tabs.cv")}
        </button>
        <button
          className={`tab-settings${tab === "settings" ? " active" : ""}`}
          data-tab="settings"
          aria-current={tab === "settings" ? "page" : undefined}
          onClick={() => setTab("settings")}
        >
          {t("settings.title")}
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
              <OverviewTab
                applications={visibleApps}
                onGoToJobs={() => setTab("board")}
                onOpenJob={(id) => navigate(`/jobs/${id}`)}
                onError={setError}
                onChanged={reload}
                stats={statsData}
                notify={notify}
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
            {tab === "stats" && (
              <StatsTab stats={statsData} fullApps={applications} />
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
        {toast?.message ?? ""}
      </div>
      <ConfirmHost />
      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              {toast.label ?? t("toast.undo")}
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
  attention,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpenDetail,
  onMove,
}: {
  a: Application;
  attention?: "overdue" | "stale" | "quiet" | null;
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
      className={`bcard stage-${a.status}${isDragging ? " dragging" : ""}${a.archived_at ? " archived" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <div className="bcard-body" onClick={onOpenDetail}>
        <strong>
          {a.title}
          {a.fit_score ? (
            <span className="fit-stars" title={`${a.fit_score}/5`}>
              {" "}
              {"★".repeat(a.fit_score)}
            </span>
          ) : null}
          {attention ? (
            <span
              className={`badge attention attention-${attention}`}
              title={t(`attention.${attention}Hint`)}
            >
              {" "}
              {t(`attention.${attention}`)}
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
            t("board.updatedAge", { age: ageDays(a.updated_at) })
          )}
        </span>
      </div>
      <select
        className={`status stage-${a.status}`}
        value={a.status}
        onChange={(e) => onMove(e.target.value)}
        aria-label={t("aria.moveToStage", { title: a.title })}
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
  attention,
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
  attention?: Map<number, "overdue" | "stale" | "quiet">;
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
    {/* Stage-grouped columns carry their own name+dot headers; the legend
        only earns its place in company-swimlane mode, whose cells are
        unlabeled (#314). */}
    {groupBy === "company" && <StageLegend />}
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
                        attention={attention?.get(a.id) ?? null}
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
                attention={attention?.get(a.id) ?? null}
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
              <div className="bcol-cards">{cardList}</div>
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

function Timeline({
  resource,
  targetId,
  onError,
  onLogged,
}: {
  resource: "applications" | "contacts";
  targetId: number;
  onError: (message: string | null) => void;
  onLogged?: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Interaction[] | null>(null);
  const [form, setForm] = useState({ type: "email", happened_at: today(), notes: "" });
  // Retrospective prompt (#221) — only surfaces for the "interview" type,
  // since that's the interaction worth reflecting on right after it
  // happens. Answers fold into the same interaction's notes rather than
  // a separate record, so the timeline stays a single source of truth.
  const [wentWell, setWentWell] = useState("");
  const [toImprove, setToImprove] = useState("");
  // Multiple interviewers per round (#220) — free-text names/roles,
  // same lightweight pattern as tags rather than linking Contact
  // records, since panel interviewers often never become a tracked
  // contact.
  const [interviewers, setInterviewers] = useState("");

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

  const [logging, setLogging] = useState(false);
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (logging) return;
    const retro = [
      wentWell.trim() && `${t("interactionTypes.retroWentWell")}: ${wentWell.trim()}`,
      toImprove.trim() && `${t("interactionTypes.retroToImprove")}: ${toImprove.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");
    const notes = [form.notes.trim(), retro].filter(Boolean).join("\n\n");
    setLogging(true);
    api
      .addInteraction(resource, targetId, {
        type: form.type,
        happened_at: form.happened_at,
        notes: notes || null,
        interviewers: form.type === "interview" ? interviewers.trim() || null : null,
      })
      .then(() => {
        setForm({ type: "email", happened_at: today(), notes: "" });
        setWentWell("");
        setToImprove("");
        setInterviewers("");
        onLogged?.();
        return load();
      })
      .catch((err) => onError((err as Error).message))
      .finally(() => setLogging(false));
  };

  return (
    <div className="timeline">
      <form className="tl-add" onSubmit={add}>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          aria-label={t("aria.interactionType")}
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
          aria-label={t("aria.interactionDate")}
        />
        <input
          placeholder={t("timeline.whatHappenedPlaceholder")}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        {form.type === "interview" && (
          <div className="tl-retro">
            <input
              placeholder={t("interactionTypes.interviewersPlaceholder")}
              value={interviewers}
              onChange={(e) => setInterviewers(e.target.value)}
            />
            <input
              placeholder={t("interactionTypes.retroWentWellPlaceholder")}
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
            />
            <input
              placeholder={t("interactionTypes.retroToImprovePlaceholder")}
              value={toImprove}
              onChange={(e) => setToImprove(e.target.value)}
            />
          </div>
        )}
        <button type="submit" className="primary" disabled={logging}>
          {t("common.log")}
        </button>
      </form>
      <ul className="tl-items">
        {(items ?? []).map((it) => (
          <li key={it.id}>
            <span className="tl-type">{t(`interactionTypes.${it.type}`)}</span>
            <span className="tl-date">{formatDate(it.happened_at)}</span>
            <span className="tl-notes">
              {it.interviewers && (
                <span className="tl-interviewers">
                  {t("interactionTypes.interviewersLabel")}: {it.interviewers}
                </span>
              )}
              {it.notes ?? ""}
              {it.via_contact ? <span className="badge">{t("timeline.viaContact")}</span> : null}
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

// Dynamic import — jsPDF (~400kB) is only needed once someone actually
// downloads the comparison, not on every Stats page load (#222).
async function downloadOfferComparisonPdf(
  offers: Application[],
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const { generateOfferComparisonPdf } = await import("./pdf");
  const rows = offers.map((a) => ({
    title: a.title,
    companyName: a.company_name ?? "—",
    currency: a.salary_currency ?? "",
    totalComp: totalComp(a),
    breakdown: totalCompBreakdown(a),
    benefitsNotes: a.benefits_notes,
  }));
  const doc = generateOfferComparisonPdf(rows, {
    heading: t("stats.offerComparisonHeading"),
    totalComp: t("offer.totalComp"),
    breakdown: t("stats.offerComparisonBreakdown"),
    benefits: t("offer.benefitsNotes"),
    noOffers: t("stats.offerComparisonEmpty"),
  });
  doc.save("offer-comparison.pdf");
}

// Negotiation talking-points draft (#223) — a starting point, not a
// script: pulls together the same total-comp/benchmark numbers already
// shown on the offer, plus any competing offer, into editable prose
// rather than a form of fields that would need its own storage.
function buildNegotiationDraft(
  a: Application,
  allApplications: Application[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const lines: string[] = [t("offer.negotiationIntro", { title: a.title, company: a.company_name ?? "" })];

  const total = totalComp(a);
  if (total != null) {
    lines.push(
      t("offer.negotiationComp", {
        amount: `${a.salary_currency ?? ""} ${Math.round(total).toLocaleString()}`,
      }),
    );
  }

  const otherOffers = allApplications
    .filter((o) => o.id !== a.id && o.status === "offer" && totalComp(o) != null)
    .sort((x, y) => (totalComp(y) ?? 0) - (totalComp(x) ?? 0));
  const bestOther = otherOffers[0];
  if (bestOther && total != null && (totalComp(bestOther) ?? 0) > total) {
    lines.push(
      t("offer.negotiationCompeting", {
        company: bestOther.company_name ?? t("offer.negotiationAnotherCompany"),
      }),
    );
  }

  const sameRole = allApplications.filter(
    (o) => o.id !== a.id && o.status === "offer" && o.role_type === a.role_type && totalComp(o) != null,
  );
  const pool = sameRole.length ? sameRole : otherOffers;
  if (total != null && pool.length) {
    const med = median(pool.map((o) => totalComp(o)!));
    if (med != null && med > 0 && total < med) {
      lines.push(
        t("offer.negotiationBelowMarket", {
          pct: Math.round(((med - total) / med) * 100),
        }),
      );
    }
  }

  lines.push(t("offer.negotiationClose"));
  return lines.join("\n\n");
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

// Weekly buckets + momentum streak — shared by Stats (apps/week histogram)
// and Overview (streak + weekly goal). Buckets are [now-(8-i)*WEEK,
// ...+WEEK): i=0 is 8 weeks ago, i=7 is the current week ((8-i), not
// (7-i) — see #262).
function computeWeeklyMomentum(
  apps: { applied_at: string | null; created_at: string }[],
  history: { changed_at: string }[],
) {
  const WEEK = 7 * 86400000;
  const now = Date.now();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = now - (8 - i) * WEEK;
    const count = apps.filter((a) => {
      const t = parseSqlDate(a.applied_at ?? a.created_at);
      return t >= start && t < start + WEEK;
    }).length;
    const label = new Date(start).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
    return { label, count, start };
  });
  // Momentum streak (#145) — consecutive weeks (ending this week) with
  // any job-search activity: a new application or a logged status change.
  const activityWeeks = weeks.map((w) => {
    const hasHistory = history.some((h) => {
      const t = parseSqlDate(h.changed_at);
      return t >= w.start && t < w.start + WEEK;
    });
    return w.count > 0 || hasHistory;
  });
  let streak = 0;
  for (let i = activityWeeks.length - 1; i >= 0; i--) {
    if (activityWeeks[i]) streak++;
    else break;
  }
  const streakBroken = streak === 0 && activityWeeks.slice(0, -1).some(Boolean);
  return { weeks, streak, streakBroken };
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
  const [blocklist, setBlocklist] = useState<
    { id: number; company: string }[] | null
  >(null);
  const [newBlockedCompany, setNewBlockedCompany] = useState("");
  const [atsBoards, setAtsBoards] = useState<AtsBoard[] | null>(null);
  const [newBoardSource, setNewBoardSource] = useState<"greenhouse" | "ashby">(
    "greenhouse",
  );
  const [newBoardSlug, setNewBoardSlug] = useState("");

  const [failed, setFailed] = useState(false);
  const loadConfig = useCallback(
    () =>
      api
        .feedConfig()
        .then((c) => {
          setFailed(false);
          setConfig(c);
        })
        .catch((e) => {
          setFailed(true);
          onError((e as Error).message);
        }),
    [onError],
  );

  const loadBlocklist = useCallback(
    () =>
      api
        .feedBlocklist()
        .then(setBlocklist)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );

  const loadAtsBoards = useCallback(
    () =>
      api
        .atsBoards()
        .then(setAtsBoards)
        .catch((e) => onError((e as Error).message)),
    [onError],
  );

  useEffect(() => {
    loadConfig();
    loadBlocklist();
    loadAtsBoards();
  }, [loadConfig, loadBlocklist, loadAtsBoards]);

  const addBlockedCompany = (e: FormEvent) => {
    e.preventDefault();
    const company = newBlockedCompany.trim();
    if (!company) return;
    api
      .blockFeedCompany(company)
      .then(() => {
        setNewBlockedCompany("");
        return loadBlocklist();
      })
      .catch((e) => onError((e as Error).message));
  };

  const removeBlockedCompany = (id: number) => {
    api
      .unblockFeedCompany(id)
      .then(loadBlocklist)
      .catch((e) => onError((e as Error).message));
  };

  const addAtsBoard = (e: FormEvent) => {
    e.preventDefault();
    const slug = newBoardSlug.trim();
    if (!slug) return;
    api
      .addAtsBoard(newBoardSource, slug)
      .then(() => {
        setNewBoardSlug("");
        return loadAtsBoards();
      })
      .catch((e) => onError((e as Error).message));
  };

  const removeAtsBoard = (id: number) => {
    api
      .removeAtsBoard(id)
      .then(loadAtsBoards)
      .catch((e) => onError((e as Error).message));
  };

  const addRole = (e: FormEvent) => {
    e.preventDefault();
    if (!newRoleLabel.trim()) return;
    api
      .createRoleType(newRoleLabel.trim())
      .then(() => {
        setNewRoleLabel("");
        notify(t("toast.roleTypeAdded"));
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

  const removeRole = async (r: RoleTypeDef) => {
    if (
      !(await requestConfirm(t("confirm.deleteRoleType", { label: r.label })))
    )
      return;
    api
      .deleteRoleType(r.id)
      .then(() => {
        notify(t("toast.deleted", { name: r.label }));
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
        notify(t("toast.savedSettings", { source }));
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

  if (failed && !config) return <LoadFailed onRetry={loadConfig} />;
  if (!config) return <p className="muted small">{t("common.loading")}</p>;

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

      <h3 className="detail-sub">{t("feedSettings.blocklist")}</h3>
      <div className="keyword-chips">
        {(blocklist ?? []).map((b) => (
          <span key={b.id} className="chip">
            {b.company}
            <button
              onClick={() => removeBlockedCompany(b.id)}
              aria-label={t("feedSettings.removeKeyword")}
            >
              <RemoveIcon />
            </button>
          </span>
        ))}
        <form onSubmit={addBlockedCompany}>
          <input
            placeholder={t("feedSettings.blocklistPlaceholder")}
            value={newBlockedCompany}
            onChange={(e) => setNewBlockedCompany(e.target.value)}
          />
        </form>
      </div>

      <h3 className="detail-sub">{t("feedSettings.atsBoards")}</h3>
      <p className="muted small">{t("feedSettings.atsBoardsHint")}</p>
      <ul className="settings-list">
        {(atsBoards ?? []).map((b) => (
          <li key={b.id}>
            <span>
              {b.source === "greenhouse" ? "Greenhouse" : "Ashby"}: {b.slug}
            </span>
            <button className="danger" onClick={() => removeAtsBoard(b.id)}>
              <RemoveIcon />
            </button>
          </li>
        ))}
      </ul>
      <form className="settings-add" onSubmit={addAtsBoard}>
        <select
          value={newBoardSource}
          onChange={(e) => setNewBoardSource(e.target.value as "greenhouse" | "ashby")}
        >
          <option value="greenhouse">Greenhouse</option>
          <option value="ashby">Ashby</option>
        </select>
        <input
          placeholder={t("feedSettings.atsBoardSlugPlaceholder")}
          value={newBoardSlug}
          onChange={(e) => setNewBoardSlug(e.target.value)}
        />
        <button type="submit" className="primary">
          {t("feedSettings.add")}
        </button>
      </form>
    </div>
  );
}

function FeedTab({
  onError,
  notify,
  roleTypes,
  onOpenSettings,
  onChanged,
  onOpenJob,
}: {
  onError: (message: string | null) => void;
  notify: (message: string, undo?: () => void, label?: string) => void;
  roleTypes: RoleTypeDef[];
  onOpenSettings: () => void;
  onChanged: () => Promise<void>;
  onOpenJob: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const cardsRef = useRef<HTMLUListElement>(null);
  const kbNav = useRef(false);
  // Move real DOM focus to the j/k-selected card (#285) so the selection is
  // perceivable to screen-reader and keyboard users, not just a CSS class.
  // Only on actual keyboard nav — not the initial mount or a list refresh,
  // which would otherwise steal focus to the first card.
  useEffect(() => {
    if (!kbNav.current) return;
    kbNav.current = false;
    const cards = cardsRef.current?.querySelectorAll<HTMLElement>(".feed-card");
    cards?.[focusedIndex]?.focus();
  }, [focusedIndex]);

  const load = useCallback(
    () => {
      setFailed(false);
      return api
        .feed()
        .then((page) => {
          setItems(page.items);
          setCursor(page.nextCursor);
        })
        .catch((e) => {
          setFailed(true);
          onError((e as Error).message);
        });
    },
    [onError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    api
      .feed(cursor)
      .then((page) => {
        setItems((prev) => [...(prev ?? []), ...page.items]);
        setCursor(page.nextCursor);
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setLoadingMore(false));
  };

  const refresh = () => {
    setRefreshing(true);
    api
      .refreshFeed()
      .then((r) => {
        notify(t("toast.feedFound", { inserted: r.inserted, seen: r.seen }));
        return load();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setRefreshing(false));
  };

  const dismiss = (item: FeedItem) => {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    api.dismissFeedItem(item.id).catch((e) => {
      // Optimistic removal must roll back (#346) — otherwise the card
      // vanishes client-side while still active server-side.
      setItems((prev) => (prev ? [item, ...prev] : [item]));
      onError((e as Error).message);
    });
  };

  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
  const add = (item: FeedItem) => {
    if (addingIds.has(item.id)) return;
    setAddingIds((s) => new Set(s).add(item.id));
    api
      .addFeedItem(item.id)
      .then((created) => {
        setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
        void onChanged();
        notify(
          t("toast.addedToJobs", { title: item.title }),
          () => onOpenJob(created.id),
          t("toast.open"),
        );
      })
      .catch((e) => onError((e as Error).message))
      .finally(() =>
        setAddingIds((s) => {
          const next = new Set(s);
          next.delete(item.id);
          return next;
        }),
      );
  };

  // Keep focus in range after add/dismiss shrinks the list (#261) —
  // otherwise j/k could point past the end and land nowhere.
  useEffect(() => {
    setFocusedIndex((i) =>
      Math.min(i, Math.max(0, (items?.length ?? 1) - 1)),
    );
  }, [items]);

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
        kbNav.current = true;
        setFocusedIndex((i) => Math.min(i + 1, list.length - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        kbNav.current = true;
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
        <button className="btn-secondary" onClick={onOpenSettings}>
          {t("feed.settings")}
        </button>
        <button className="primary" disabled={refreshing} onClick={refresh}>
          {refreshing ? t("feed.checking") : t("feed.checkNow")}
        </button>
      </div>

      {failed && !items && <LoadFailed onRetry={load} />}
      {!failed && !items && <LoadingSkeleton />}

      <ul className="cards" ref={cardsRef}>
        {(items ?? []).map((item, i) => (
          <FeedCard
            key={item.id}
            item={item}
            roleLabel={roleTypes.find((r) => r.slug === item.role_type)?.label ?? item.role_type}
            focused={i === focusedIndex}
            adding={addingIds.has(item.id)}
            onAdd={() => add(item)}
            onDismiss={() => dismiss(item)}
          />
        ))}
        {items?.length === 0 && (
          <li className="empty">
            <EmptyFeedIcon />
            {t("empty.feedNothingNew")}
          </li>
        )}
      </ul>
      {cursor && (
        <div className="load-more">
          <button onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t("common.loading") : t("common.loadMore")}
          </button>
        </div>
      )}
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
  adding,
  onAdd,
  onDismiss,
}: {
  item: FeedItem;
  roleLabel: string;
  focused: boolean;
  adding: boolean;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
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
      tabIndex={focused ? 0 : -1}
      aria-current={focused ? "true" : undefined}
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
            {" · "}
            {t("feed.viaSource", { source: item.source })}
          </span>
          {safeHref(item.url) && (
            <a href={safeHref(item.url)} target="_blank" rel="noreferrer" className="small">
              {t("feed.viewPosting")}
            </a>
          )}
        </div>
        <div className="card-actions">
          <button className="primary" onClick={onAdd} disabled={adding}>
            {t("feed.addToJobs")}
          </button>
          <button onClick={onDismiss}>{t("feed.dismiss")}</button>
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
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api
      .agenda()
      .then(setEntries)
      .catch((e) => {
        setFailed(true);
        onError((e as Error).message);
      });
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed && !entries) return <LoadFailed onRetry={load} />;
  if (!entries) return <p className="muted small">{t("common.loading")}</p>;

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
          <EmptyCalendarIcon />
          {t("calendar.empty")}
        </p>
      )}
      {days.map((day) => (
        <div key={day} className="agenda-day">
          <h3
            className={`agenda-date${day === todayStr ? " today" : day < todayStr ? " past" : ""}`}
          >
            {formatDate(day)}
            {day === todayStr ? t("calendar.todaySuffix") : ""}
          </h3>
          <ul className="agenda-items">
            {(groups.get(day) ?? []).map((e) => (
              <li
                key={`${e.kind}-${e.id}`}
                className={`agenda-item kind-${e.kind}`}
                {...rowActivate(() => e.title && onJump(e.title))}
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
    return `${t("timeline.loggedOn", { type, title: e.title })}${co}${e.notes ? ` — ${e.notes}` : ""}`;
  }
  return `${t("timeline.attachedTo", { filename: e.filename, title: e.title })}${co}`;
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
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api
      .activity()
      .then(setEvents)
      .catch((e) => {
        setFailed(true);
        onError((e as Error).message);
      });
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed && !events) return <LoadFailed onRetry={load} />;
  if (!events) return <LoadingSkeleton />;

  return (
    <section className="activity">
      {events.length === 0 && (
        <p className="empty">
          <EmptyActivityIcon />
          {t("activityFeed.empty")}
        </p>
      )}
      <ul className="activity-list">
        {events.map((e) => (
          <li
            key={`${e.kind}-${e.application_id}-${e.ts}`}
            className={`activity-item kind-${e.kind}`}
            {...rowActivate(() => onOpenJob(e.application_id))}
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
  const inlinePatch = (req: Promise<unknown>) =>
    req
      .then(() => {
        setInlineField(null);
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
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
                <span className="field-label">{t("detail.fitScore")}</span>
                <span className="fit-edit">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`fit-star${(a.fit_score ?? 0) >= n ? " on" : ""}`}
                      aria-label={t("detail.fitSetAria", { n })}
                      aria-pressed={(a.fit_score ?? 0) >= n}
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
                  ))}
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
                    <button type="submit" className="primary">
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
                    aria-label={t("common.edit")}
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
                    <button type="submit" className="primary">
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
                    aria-label={t("common.edit")}
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
function OverviewTab({
  applications,
  onGoToJobs,
  onOpenJob,
  onError,
  onChanged,
  stats,
  notify,
}: {
  applications: Application[];
  onGoToJobs: () => void;
  onOpenJob: (id: number) => void;
  onError: (message: string | null) => void;
  onChanged: () => Promise<unknown> | void;
  stats: Stats | null;
  notify: (message: string, undo?: () => void, label?: string) => void;
}) {
  const { t } = useTranslation();
  // The full activity feed folds in here (#285) instead of its own tab —
  // lazy-loaded on expand so the landing page stays fast.
  const [showActivity, setShowActivity] = useState(false);
  const open = applications.filter((a) => !isDead(a.status));
  const interviewing = open.filter(
    (a) => a.status === "interview" || a.status === "offer",
  ).length;

  const recent = [...applications]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);

  // Motivation widgets live here, not in Stats (#314); the stats payload
  // arrives via the single App-level fetch.
  const momentum = stats
    ? computeWeeklyMomentum(stats.applications, stats.history)
    : null;

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

      {/* Work left, motivation right (#314) — the landing page had become
          an eight-item single file after the widgets moved here. */}
      <div className="overview-cols">
        <div className="overview-main">
          <NextUpPanel
            notify={notify}
            applications={applications}
            onChanged={onChanged}
            onError={onError}
          />

          <h3 className="side-h">{t("overview.recentlyUpdated")}</h3>
          {recent.length === 0 ? (
            <p className="muted small">{t("overview.noActivity")}</p>
          ) : (
            <ul className="side-list overview-recent">
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

          <button className="primary overview-cta" onClick={onGoToJobs}>
            {t("overview.viewAllJobs")}
          </button>
        </div>

        <aside className="overview-side">
          {momentum && (
            <>
              <MomentumStreak
                streak={momentum.streak}
                broken={momentum.streakBroken}
              />
              <WeeklyGoal
                thisWeekCount={momentum.weeks[momentum.weeks.length - 1].count}
              />
            </>
          )}
          <WinsJournal onError={onError} />
        </aside>
      </div>

      <button
        className="btn-secondary overview-activity-toggle"
        onClick={() => setShowActivity((v) => !v)}
        aria-expanded={showActivity}
      >
        {showActivity ? t("overview.hideActivity") : t("overview.showActivity")}
      </button>
      {showActivity && <ActivityTab onError={onError} onOpenJob={onOpenJob} />}
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
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [showHelp, setShowHelp] = useState(false);
  // Mobile: filters + saved views collapse behind one toggle (#314) so
  // triage starts at the board, not below a stack of controls.
  const [showFilters, setShowFilters] = useState(false);

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
    showArchived,
    sort: "updated",
  });
  const applyView = (v: SavedView) => {
    const f = v.filters;
    setQuery(f.query ?? "");
    setRoleFilter(f.roleFilter ?? "all");
    setCompanyFilter(f.companyFilter ?? "all");
    setTagFilter(f.tagFilter ?? "all");
    setShowArchived(!!f.showArchived);
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
  const attention = new Map<number, "overdue" | "stale" | "quiet">();
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
    const val = isOverdue(a)
      ? "overdue"
      : a.posting_status === "maybe_stale"
        ? "stale"
        : quiet
          ? "quiet"
          : null;
    if (val) attention.set(a.id, val as "overdue" | "stale" | "quiet");
  }
  return { allTags, attention };
  }, [applications, history, lastInteractions]);

  const q = query.trim().toLowerCase();
  const filtered = applications.filter(
    (a) =>
      (showArchived || !a.archived_at) &&
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

  return (
    <section>
      <StageHistogram applications={filtered} />

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

      <div className="toolbar">
        <input
          ref={searchRef}
          type="search"
          className="search"
          aria-label={t("toolbar.searchPlaceholder")}
          placeholder={t("toolbar.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={onOpenQuickAdd}>
          {t("toolbar.addJob")}
        </button>
        <button
          className="help-btn"
          onClick={() => setShowHelp(true)}
          aria-label={t("shortcuts.title")}
        >
          ?
        </button>
      </div>

      <button
        className="btn-secondary pipeline-filters-toggle"
        aria-expanded={showFilters}
        onClick={() => setShowFilters((v) => !v)}
      >
        {t("filters.toggle")}
      </button>
      <div className={`pipeline-filters${showFilters ? " open" : ""}`}>
      <div className="filters">
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
        <label className="show-archived">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t("filters.showArchived")}
        </label>
      </div>

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

      {/* Closed drawer (#314) — terminal outcomes are archive material,
          not work: a collapsed compact list below the board rather than a
          sixth column that would outgrow every real one. Respects the
          same filters, so "did I already apply at X?" works here. */}
      {(() => {
        const closed = filtered
          .filter((a) => isDead(a.status))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        if (!closed.length) return null;
        return (
          <details className="closed-drawer">
            <summary>
              {t("board.closedCount", { count: closed.length })}
            </summary>
            <ul>
              {closed.map((a) => (
                <li key={a.id} {...rowActivate(() => onOpenJob(a.id))}>
                  <span className="closed-title">{a.title}</span>
                  <span className="closed-co">{a.company_name ?? "—"}</span>
                  <span className="closed-status">
                    {t(`stages.${a.status}`)}
                  </span>
                  <span className="closed-date">
                    {formatDate(a.updated_at.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        );
      })()}

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
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

function CompaniesTab({
  companies,
  applications,
  contacts,
  onChanged,
  onError,
  notify,
  onDelete,
  initialQuery,
  initialDetailId,
  onDetailIdChange,
}: CrudTabProps & {
  companies: Company[];
  applications: Application[];
  contacts: Contact[];
  initialQuery?: string;
  initialDetailId?: number | null;
  onDetailIdChange?: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [query, setQuery] = useState(initialQuery ?? "");
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
          aria-label={t("toolbar.searchCompanies")}
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
              {...rowActivate(() => setDetailId(c.id))}
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
                {c.is_agency ? <span className="badge">{t("company.agencyBadge")}</span> : null}
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
            {...rowActivate(() => setDetailId(c.id))}
          >
            <div className="l1">
              <strong>
                {c.name}
                {c.is_agency ? <span className="badge">{t("company.agencyBadge")}</span> : null}
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
                  ? t("company.researchedAgo", { age: ageDays(c.researched_at) })
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
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<Company>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <label>
        {t("forms.name")} *
        <input
          required
          value={form.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label>
        {t("forms.website")}
        <input
          type="url"
          value={form.website ?? ""}
          onChange={(e) => set({ website: e.target.value || null })}
        />
      </label>
      <label>
        {t("forms.location")}
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
        {t("forms.recruitmentAgency")}
      </label>
      <label className="full">
        {t("forms.notes")}
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </label>
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

  const research = () => {
    setResearching(true);
    api
      .researchCompany(c.id)
      .then(() => {
        notify(t("toast.researched", { name: c.name }));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setResearching(false));
  };

  return (
    <Dialog label={c.name} onClose={onClose} className="detail-modal">
        <div className="detail-head">
          <div>
            <h2>
              {c.name}
              {c.is_agency ? <span className="badge">{t("company.agencyBadge")}</span> : null}
            </h2>
            <span className="muted small">{c.location ?? ""}</span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
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
    </Dialog>
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
  initialDetailId,
  onDetailIdChange,
}: CrudTabProps & {
  contacts: Contact[];
  companies: Company[];
  initialQuery?: string;
  initialDetailId?: number | null;
  onDetailIdChange?: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [view, setView] = useState<"list" | "grid">(
    () => (localStorage.getItem("jobseekr_contacts_view") as "list" | "grid" | null) ?? "list",
  );
  const setViewAndPersist = (v: "list" | "grid") => {
    setView(v);
    localStorage.setItem("jobseekr_contacts_view", v);
  };
  const [query, setQuery] = useState(initialQuery ?? "");
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
          aria-label={t("toolbar.searchPeople")}
          placeholder={t("toolbar.searchPeople")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing("new")}>
          {t("toolbar.addContact")}
        </button>
        <div className="board-group-toggle" role="group" aria-label={t("contacts.view")}>
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

      {view === "grid" ? (
        <ul className="company-grid">
          {visible.map((c) => (
            <li
              key={c.id}
              className="company-tile"
              {...rowActivate(() => setDetailId(c.id))}
            >
              <div className="company-logo company-logo-placeholder" aria-hidden="true">
                {c.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="company-tile-name">{c.name}</span>
              {(c.role || c.company_name) && (
                <span className="muted small">
                  {[c.role, c.company_name].filter(Boolean).join(" · ")}
                </span>
              )}
              {c.outreach_status !== "not_contacted" && (
                <span className={`outreach-pill ${c.outreach_status}`}>
                  {t(`outreach.statuses.${c.outreach_status}`)}
                </span>
              )}
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
      ) : (
      <ul className="cards">
        {visible.map((c) => (
          <li
            key={c.id}
            className="card row2"
            {...rowActivate(() => setDetailId(c.id))}
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
      )}
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
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<Contact>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <label>
        {t("forms.name")} *
        <input
          required
          value={form.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <label>
        {t("forms.role")}
        <input
          placeholder={t("forms.rolePlaceholder")}
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
        {t("forms.company")}
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
        {t("forms.email")}
        <input
          type="email"
          value={form.email ?? ""}
          onChange={(e) => set({ email: e.target.value || null })}
        />
      </label>
      <label>
        {t("forms.phone")}
        <input
          type="tel"
          value={form.phone ?? ""}
          onChange={(e) => set({ phone: e.target.value || null })}
        />
      </label>
      <label>
        {t("forms.linkedin")}
        <input
          type="url"
          value={form.linkedin ?? ""}
          onChange={(e) => set({ linkedin: e.target.value || null })}
        />
      </label>
      <label className="full">
        {t("forms.notes")}
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value || null })}
        />
      </label>
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

  return (
    <Dialog label={c.name} onClose={onClose} className="detail-modal">
        <div className="detail-head">
          <div>
            <h2>{c.name}</h2>
            <span className="muted small">
              {[c.role, c.company_name].filter(Boolean).join(" · ")}
            </span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
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
                  {t("contact.linkedinLink")}
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
    </Dialog>
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

  const [submitting, submit] = useSubmitGuard(async () => {
    await api
      .updateProfile(form)
      .then(() => {
        notify(t("common.saved"));
        return onChanged();
      })
      .catch((e) => onError((e as Error).message));
  });
  const save = (e: FormEvent) => {
    e.preventDefault();
    submit(undefined);
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
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? t("common.saving") : t("common.save")}
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
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<WorkExperience>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
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
  const [submitting, submit] = useSubmitGuard(onSubmit);
  const set = (patch: Partial<Education>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
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
