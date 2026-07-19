import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import {
  type Stats,
  type Application,
  type Company,
  type Contact,
  type RoleTypeDef,
  type Status,
  type Profile,
} from "./types";
import "./App.css";
import {
  ErrorIcon,
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
  isDead,
  keyShortcutsEnabled,
} from "./format";
import { ConfirmHost, LoadingSkeleton } from "./ui";
import { SettingsPage } from "./settings";
import { FeedTab } from "./feed";
import { CompaniesTab, ContactsTab } from "./network";
import { CVTab } from "./cv";
import { CalendarTab } from "./calendar";
import { DashboardTab } from "./dashboard";
import { ApplicationDetailModal } from "./detail";
import { PipelineTab } from "./board";
import { CommandPalette, NotificationBell, OnboardingChecklist, QuickAddDialog } from "./chrome";

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
