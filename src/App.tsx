import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { type Profile, type Status } from "./types";
import {
  AdminIcon,
  ErrorIcon,
  NavCvIcon,
  NavInsightsIcon,
  NavFeedIcon,
  NavNetworkIcon,
  NavOverviewIcon,
  NavPipelineIcon,
  RemoveIcon,
  SettingsIcon,
} from "./icons";
import { ConfirmHost } from "./ui";
import { type Tab, TAB_PATHS, canonicalPath, parsePath } from "./routing";
import { DashboardTab } from "./dashboard";
import { InsightsTab } from "./insights";

// Tab bodies are code-split (perf review, #446): only the active tab's chunk
// loads, instead of shipping every tab in the initial bundle. Dashboard stays
// eager since it's the default landing view; a Suspense boundary in <main>
// shows the loading skeleton while a tab chunk fetches.
const SettingsPage = lazy(() =>
  import("./settings").then((m) => ({ default: m.SettingsPage })),
);
const FeedTab = lazy(() =>
  import("./feed").then((m) => ({ default: m.FeedTab })),
);
const CompaniesTab = lazy(() =>
  import("./companies").then((m) => ({ default: m.CompaniesTab })),
);
const ContactsTab = lazy(() =>
  import("./contacts").then((m) => ({ default: m.ContactsTab })),
);
const CVTab = lazy(() => import("./cv").then((m) => ({ default: m.CVTab })));
const ApplicationDetailModal = lazy(() =>
  import("./detail").then((m) => ({ default: m.ApplicationDetailModal })),
);
const PipelineTab = lazy(() =>
  import("./board").then((m) => ({ default: m.PipelineTab })),
);
const AdminPage = lazy(() =>
  import("./admin").then((m) => ({ default: m.AdminPage })),
);
import { useSession } from "./auth-client";
import {
  Button,
  CommandPalette,
  OnboardingChecklist,
  OutcomeDialog,
  PillTabs,
  QuickAddDialog,
  Skeleton,
  WordmarkMenu,
} from "./components";
import { useAppData, useToasts } from "./app-data";
import {
  useGlobalShortcuts,
  useNotificationNavigation,
  useScrolled,
  useViewportBottomOffset,
} from "./hooks";
import { BottomBar, type NavItem, ToastStack, TopBar } from "./shell";

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { tab, id: detailIdFromUrl } = parsePath(location.pathname);
  const setTab = (next: Tab) => navigate(TAB_PATHS[next]);
  const { data: session } = useSession();
  const sessionUser = session?.user;
  const isAdmin = sessionUser?.role === "admin";
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  // Which stage a board add block opened the dialog for (#535). Every other
  // entry point leaves it unset and the dialog picks its own default.
  const [quickAddStage, setQuickAddStage] = useState<Status | undefined>();
  const [showPalette, setShowPalette] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [jumpQuery, setJumpQuery] = useState("");
  const [onboardingProfile, setOnboardingProfile] = useState<Profile | null>(
    null,
  );
  // Whether the user has configured the job feed (any search keyword) — an
  // onboarding step, so a new user isn't left on an empty Feed tab (#453).
  const [feedConfigured, setFeedConfigured] = useState(false);
  // Whether the user has set their own weekly goal (#483) — a momentum-seeding
  // onboarding step. The goal row auto-creates with a default, so "configured"
  // means they changed the target or set a search-start date in Settings.
  const [goalConfigured, setGoalConfigured] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem("zenith_onboarding_dismissed") === "1",
  );

  const { toasts, notify, dismiss } = useToasts();
  const {
    applications,
    setApplications,
    statsData,
    companies,
    roleTypes,
    error,
    setError,
    loading,
    reload,
    deleteWithUndo,
    setStatus,
    outcomePrompt,
    setOutcomePrompt,
    saveOutcome,
    visibleApps,
    activeApps,
    visibleCompanies,
    visibleContacts,
  } = useAppData(notify, navigate, t);

  const scrolled = useScrolled();
  useViewportBottomOffset();
  useNotificationNavigation();
  useGlobalShortcuts({
    onTogglePalette: () => setShowPalette((v) => !v),
    onQuickAdd: () => setShowQuickAdd(true),
    // 1-based, matching the keycaps the menu prints. Out-of-range keys are
    // ignored rather than clamped: pressing 9 with six destinations should
    // do nothing, not land on the last one.
    onGoToIndex: (i) => {
      const target = navItems[i - 1];
      if (target) {
        setTab(target.to);
        setMenuOpen(false);
      }
    },
    onOpenSettings: () => {
      setTab("settings");
      setMenuOpen(false);
    },
    onToggleMenu: () => setMenuOpen((v) => !v),
  });

  useEffect(() => {
    if (onboardingDismissed) return;
    api.profile().then(setOnboardingProfile).catch(() => {});
    api
      .feedConfig()
      .then((cfg) => setFeedConfigured(cfg.keywords.length > 0))
      .catch(() => {});
    api
      .goals()
      .then((g) =>
        setGoalConfigured(
          g.search_started_at != null || g.weekly_app_goal !== 5,
        ),
      )
      .catch(() => {});
  }, [onboardingDismissed]);

  const dismissOnboarding = () => {
    localStorage.setItem("zenith_onboarding_dismissed", "1");
    setOnboardingDismissed(true);
  };

  // Guard the admin route (#457): a non-admin who lands on /admin (typed URL,
  // stale link) is sent home. Wait for the session to resolve before deciding.
  useEffect(() => {
    if (tab === "admin" && sessionUser && !isAdmin) navigate("/");
  }, [tab, sessionUser, isAdmin, navigate]);

  // Legacy URLs (/jobs/:id, /stats, …) still resolve, but the address bar is
  // rewritten to the canonical route so bookmarks, share links and push
  // notifications converge on one path per screen (#488). replace: true keeps
  // the dead path out of the back stack.
  useEffect(() => {
    const canonical = canonicalPath(location.pathname);
    if (canonical) navigate(canonical, { replace: true });
  }, [location.pathname, navigate]);

  // /board/:id renders a routed detail page (#314) instead of the old
  // pane/overlay duality — one presentation for every entry point,
  // back-button friendly.
  const routedJob =
    tab === "board" && detailIdFromUrl != null
      ? visibleApps.find((a) => a.id === detailIdFromUrl) ?? null
      : null;

  // Primary destinations, rendered from one list into both the desktop rail
  // (.side) and the sub-900px .tabs bar so the two never drift. Settings is
  // pinned separately (rail foot / last tab). `data` drives the mobile
  // scroll-into-view probe (tabsRef).
  const navItems: NavItem[] = [
    { data: "overview", to: "overview", active: tab === "overview", icon: <NavOverviewIcon />, label: t("tabs.overview") },
    { data: "pipeline", to: "board", active: tab === "board", icon: <NavPipelineIcon />, label: t("tabs.pipeline") },
    { data: "feed", to: "feed", active: tab === "feed", icon: <NavFeedIcon />, label: t("tabs.feed") },
    { data: "network", to: "companies", active: tab === "companies" || tab === "contacts", icon: <NavNetworkIcon />, label: t("tabs.network") },
    { data: "cv", to: "cv", active: tab === "cv", icon: <NavCvIcon />, label: t("tabs.cv") },
    { data: "insights", to: "insights", active: tab === "insights", icon: <NavInsightsIcon />, label: t("tabs.insights") },
    // Admin-only destination (#457) — the dedicated admin area, appended so it
    // shows in the rail and mobile tabs only for admins.
    ...(isAdmin
      ? [{ data: "admin" as const, to: "admin" as const, active: tab === "admin", icon: <AdminIcon />, label: t("admin.navLabel") }]
      : []),
  ];
  const pageTitle =
    tab === "settings"
      ? t("settings.title")
      : (navItems.find((n) => n.active)?.label ?? t("tabs.overview"));
  const onboardingComplete =
    !!(onboardingProfile?.name && onboardingProfile?.email) &&
    companies.length > 0 &&
    applications.length > 0 &&
    feedConfigured;
  const showOnboarding = !onboardingDismissed && !onboardingComplete;
  const onboardingProps = {
    profileDone: !!(onboardingProfile?.name && onboardingProfile?.email),
    companyDone: companies.length > 0,
    jobDone: applications.length > 0,
    feedDone: feedConfigured,
    goalDone: goalConfigured,
    onGoToProfile: () => setTab("cv"),
    onGoToCompanies: () => setTab("companies"),
    onAddJob: () => setShowQuickAdd(true),
    onGoToFeed: () => navigate("/settings?s=feed"),
    onSetGoal: () => navigate("/settings"),
    onDismiss: dismissOnboarding,
    onLoadSample: () => navigate("/settings?s=data"),
  };

  return (
    <div className="app">
      {showQuickAdd && (
        <QuickAddDialog
          companies={visibleCompanies}
          initialStatus={quickAddStage}
          onClose={() => setShowQuickAdd(false)}
          onError={setError}
          onCreated={(a, open) => {
            setShowQuickAdd(false);
            notify(t("common.saved"));
            // Navigate on the optimistic append instead of blocking on the
            // five-endpoint reload — the page fills in as data lands.
            setApplications((prev) => [...prev, a]);
            if (open) navigate(`/board/${a.id}`);
            void reload();
          }}
        />
      )}
      {outcomePrompt && (
        <OutcomeDialog
          status={outcomePrompt.status}
          onClose={() => setOutcomePrompt(null)}
          onSave={(reason, note) => {
            void saveOutcome(outcomePrompt.id, reason, note);
            setOutcomePrompt(null);
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
            navigate(`/board/${id}`);
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
              id: "go-feed",
              label: t("palette.goFeed"),
              run: () => {
                setShowPalette(false);
                navigate("/feed");
              },
            },
            {
              id: "go-cv",
              label: t("palette.goCv"),
              run: () => {
                setShowPalette(false);
                navigate("/cv");
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
      {menuOpen && (
        <WordmarkMenu
          destinations={navItems.map((n, i) => ({
            id: n.data,
            label: n.label,
            shortcut: String(i + 1),
            icon: n.icon,
            active: n.active,
          }))}
          actions={[
            {
              id: "settings",
              label: t("settings.title"),
              // The keycaps print what the app actually answers to, not what
              // the spec proposed: quick-add has been "n" since #285 and is
              // documented in the shortcuts help, so the menu says "n".
              shortcut: ",",
              icon: <SettingsIcon />,
              active: tab === "settings",
            },
            {
              id: "quick-add",
              label: t("toolbar.addJob"),
              shortcut: "n",
              icon: <span aria-hidden="true">+</span>,
              active: false,
            },
          ]}
          onSelect={(id) => {
            setMenuOpen(false);
            if (id === "settings") return setTab("settings");
            if (id === "quick-add") return setShowQuickAdd(true);
            const target = navItems.find((n) => n.data === id);
            if (target) setTab(target.to);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
      <div className="main">
        <TopBar
          scrolled={scrolled}
          pageTitle={pageTitle}
          settingsActive={tab === "settings"}
          onOpenSettings={() => setTab("settings")}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenBoard={() => setTab("board")}
        />

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
          <Skeleton />
        ) : (
          <Suspense fallback={<Skeleton />}>
            {tab === "overview" && showOnboarding && (
              <OnboardingChecklist {...onboardingProps} />
            )}
            {tab === "overview" && (
              <DashboardTab
                applications={visibleApps}
                onOpenJob={(id) => navigate(`/board/${id}`)}
                onGoToJobs={() => setTab("board")}
                onError={setError}
                onChanged={reload}
                stats={statsData}
                notify={notify}
                onOpenQuickAdd={() => setShowQuickAdd(true)}
              />
            )}
            {tab === "insights" && (
              <InsightsTab
                applications={visibleApps}
                onGoToJobs={() => setTab("board")}
                onOpenJob={(id) => navigate(`/board/${id}`)}
                onError={setError}
                onJump={(title) => {
                  setJumpQuery(title);
                  setTab("board");
                }}
                stats={statsData}
              />
            )}
            {routedJob && (
              <section className="job-page">
                <Button
                  variant="secondary"
                  className="job-back"
                  onClick={() => {
                    // Return to wherever the user came from — dashboard, feed,
                    // board — not always the pipeline (#448). location.key is
                    // "default" only on a direct deep-link with no in-app
                    // history; fall back to the board there.
                    if (location.key !== "default") navigate(-1);
                    else navigate("/board");
                  }}
                >
                  ← {t("common.back")}
                </Button>
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
                  history={statsData?.history ?? []}
                  onSaveOutcome={saveOutcome}
                  asPane
                />
              </section>
            )}
            {tab === "board" && !routedJob && (
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
                onSaveOutcome={saveOutcome}
                lastInteractions={statsData?.interactions ?? []}
                onOpenJob={(id: number | null) =>
                  navigate(id ? `/board/${id}` : "/board")
                }
                onOpenQuickAdd={(stage) => {
                  setQuickAddStage(stage);
                  setShowQuickAdd(true);
                }}
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
                onOpenJob={(id) => navigate(`/board/${id}`)}
              />
            )}
            {(tab === "companies" || tab === "contacts") && (
              <PillTabs<"companies" | "contacts">
                tabs={[
                  { key: "companies", label: t("tabs.companies") },
                  { key: "contacts", label: t("tabs.people") },
                ]}
                active={tab}
                onSelect={setTab}
                aria-label={t("tabs.network")}
              />
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
            {tab === "admin" && isAdmin && <AdminPage onError={setError} />}
            {tab === "settings" && (
              <SettingsPage
                roleTypes={roleTypes}
                onRoleTypesChanged={reload}
                notify={notify}
              />
            )}
          </Suspense>
        )}
      </main>
      </div>

      <BottomBar
        onSearch={() => setShowPalette(true)}
        onQuickAdd={() => setShowQuickAdd(true)}
      />
      <ConfirmHost />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
